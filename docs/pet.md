# Pet System — Fixes, Architecture, and Lootbox Design

A complete write‑up of the current pet system, why it's broken on prod, how to repair it, and how to extend it into a configurable, content‑driven pet + lootbox system with secure backend‑gated assets.

---

## Table of contents

1. [Where the code lives today](#1-where-the-code-lives-today)
2. [The two bugs you are seeing (root cause)](#2-the-two-bugs-you-are-seeing-root-cause)
3. [Minimal patch to make the current pet move on prod](#3-minimal-patch-to-make-the-current-pet-move-on-prod)
4. [Refactor: content‑driven, extensible pet system](#4-refactor-contentdriven-extensible-pet-system)
5. [Backend: pet catalog, inventory, and asset gating](#5-backend-pet-catalog-inventory-and-asset-gating)
6. [Lootboxes: server‑authoritative rolls](#6-lootboxes-serverauthoritative-rolls)
7. [Frontend: inventory, store, opening flow](#7-frontend-inventory-store-opening-flow)
8. [Security model](#8-security-model)
9. [Migrations + rollout plan](#9-migrations--rollout-plan)
10. [Implementation checklist](#10-implementation-checklist)

---

## 1. Where the code lives today

### Frontend (Vite + React 19, in [client/](../client))

All pet code is under [client/src/modules/pets/](../client/src/modules/pets/):

| File | Role |
|---|---|
| [index.tsx](../client/src/modules/pets/index.tsx) | `Pets` component, hardcodes the `examplePet` (`cat-1`) and calls `addPet` on mount. |
| [models/pet.ts](../client/src/modules/pets/models/pet.ts) | `Pet` interface, `BehaviorTypes` union. |
| [components/PetSprite.tsx](../client/src/modules/pets/components/PetSprite.tsx) | One absolutely‑positioned `<div>` per pet; registers its DOM ref with the engine. |
| [engine/PetEngine.ts](../client/src/modules/pets/engine/PetEngine.ts) | Class holding the pet array, the `requestAnimationFrame` loop, and the render step. |
| [engine/behaviors.ts](../client/src/modules/pets/engine/behaviors.ts) | Behavior FSM: `idle`, `walk`, `follow`, `sleep`. |
| [engine/physics.ts](../client/src/modules/pets/engine/physics.ts) | Smooth acceleration toward target velocity + screen bounce. |
| [engine/collisions.ts](../client/src/modules/pets/engine/collisions.ts) | AABB pet‑vs‑pet separation + screen bounds. |
| [engine/animation.ts](../client/src/modules/pets/engine/animation.ts) | Sprite‑sheet frame stepper; sets `background-image` + `background-position` each frame. |
| [hooks/usePetEngine.ts](../client/src/modules/pets/hooks/usePetEngine.ts) | Owns the singleton‑ish engine instance, starts/stops it. |
| [hooks/usePets.ts](../client/src/modules/pets/hooks/usePets.ts) | Public hook exposing `addPet`, `removePet`, `pets`. |
| [assets/cat/](../client/src/modules/pets/assets/cat/) | The cat sprite sheets (`idle.png`, `walk.png`, `sleep.png`, `follow.png`) bundled into the client build. |

The `Pets` component is mounted as a global fixed overlay (`pointer-events-none`, `z-50`) from [client/src/App.tsx](../client/src/App.tsx).

### Backend

Two servers exist:

- [server/](../server/) — a small Node/Express app that only handles `texts`. Not relevant to pets.
- [fastapi-server/](../fastapi-server/) — the real backend. SQLAlchemy + Alembic, session‑cookie auth, WebSocket chat, points/themes economy.

There is **no pet code in either backend today**. Pets are purely a client‑side toy with a single hardcoded cat in [index.tsx:6‑26](../client/src/modules/pets/index.tsx#L6-L26). All new server work in this doc lands in [fastapi-server/](../fastapi-server/).

Relevant existing primitives we will reuse:

- Sessions: [`get_session_from_request`](../fastapi-server/app/utils/session_tokens.py#L24-L42) (cookie `session_id`, 24 h sliding expiry).
- Currency: [`User_Point`](../fastapi-server/app/models/user_points.py) + [`/points` routes](../fastapi-server/app/routes/points.py).
- A near‑identical "buy from catalog" flow already exists for themes: [`/themes/buy/{theme}`](../fastapi-server/app/routes/themes.py#L54-L80). Pet lootboxes follow the same pattern, with a server‑side RNG step added.
- WebSocket fan‑out: [`ConnectionManager`](../fastapi-server/app/ws/manager.py) + [`/ws/chat`](../fastapi-server/app/routes/ws.py).
- Router registration: [main.py:4](../fastapi-server/app/main.py#L4).

---

## 2. The two bugs you are seeing (root cause)

### Bug A — "On prod the pet doesn't move"

The culprit is this branch in [engine/PetEngine.ts:29‑34](../client/src/modules/pets/engine/PetEngine.ts#L29-L34):

```ts
start() {
    if (this.running) return
    this.running = true
    if (this.pets.length < 1) return   // ← bails before scheduling rAF
    const loop = (time: number) => { ... }
    requestAnimationFrame(loop)
}
```

`start()` is called from [hooks/usePetEngine.ts:11‑20](../client/src/modules/pets/hooks/usePetEngine.ts#L11-L20) inside a `useEffect` on the engine instance. Effects in React run **child → parent**, but `addPet(examplePet)` is itself in an effect inside the `Pets` component ([index.tsx:31‑33](../client/src/modules/pets/index.tsx#L31-L33)).

Order of operations in a production build (no StrictMode double‑invoke):

1. `Pets` renders.
2. `usePets()` → `usePetEngine()` runs; the engine instance is created via the in‑render `setEngine(new PetEngine())` ([usePetEngine.ts:7‑9](../client/src/modules/pets/hooks/usePetEngine.ts#L7-L9)).
3. React commits.
4. `usePetEngine`'s effect runs: `engine.start()` — `pets.length === 0`, so `start()` flips `running = true` and **returns without scheduling rAF**.
5. `Pets`'s own effect runs: `addPet(examplePet)` pushes the pet, but `running` is already `true` so any second `start()` call is also a no‑op ([PetEngine.ts:30](../client/src/modules/pets/engine/PetEngine.ts#L30)).
6. The pet sits at `(100, innerHeight - 120)` forever.

In development the same code can appear to work because:

- React 19 Strict Mode (Vite dev) mounts effects twice. The second mount can run `addPet` before the second `start()`, so the rAF gets scheduled with at least one pet present.
- HMR remounts can put things in a different order on subsequent edits.

### Bug B — "On local there are 2 pets, one moves one is still"

Strict Mode double‑invokes effects in dev. [index.tsx:31‑33](../client/src/modules/pets/index.tsx#L31-L33) is:

```ts
useEffect(() => { addPet(examplePet) }, [])
```

Both invocations push the **same `examplePet` object reference** into `engine.pets` (the array is filtered by `id` only on `removePet`, but `addPet` does no de‑dupe — [PetEngine.ts:17‑19](../client/src/modules/pets/engine/PetEngine.ts#L17-L19)). React renders both via `pets.map(...)` keyed by `pet.id` ([index.tsx:38‑43](../client/src/modules/pets/index.tsx#L38-L43)) — and because both entries share `id: 'cat-1'`, React reuses one DOM node for both list items, so [PetSprite](../client/src/modules/pets/components/PetSprite.tsx) registers the same DOM element against both Pet entries via `setPetElement` ([PetEngine.ts:21‑23](../client/src/modules/pets/engine/PetEngine.ts#L21-L23)).

Result: there are two entries in `engine.pets`, but only one DOM node. The render loop ([PetEngine.ts:60‑64](../client/src/modules/pets/engine/PetEngine.ts#L60-L64)) writes `transform` for entry A, then immediately overwrites it for entry B. Because both share the same starting position and behavior RNG diverges, one entry ends up walking while the other's `transform` write keeps clobbering the moving one — so you see "one moves, one stuck" depending on which `setPetElement` call ran last and which entry's behavior timer happens to be on `sleep`/`idle`.

### Other live problems worth fixing in the same pass

- [behaviors.ts:18](../client/src/modules/pets/engine/behaviors.ts#L18) `console.log(pet.currentBehavior)` runs every frame for every pet — pure dev noise + perf hit.
- [behaviors.ts:12‑16](../client/src/modules/pets/engine/behaviors.ts#L12-L16) decrements `behaviorTimer` by `1` per frame and resets it to `5000 + Math.random()*1240`. The comment says "milliseconds", but the value is decremented in frames, so a behavior holds for ~83 seconds at 60 fps, not 5. Either use `deltaTime` or store the timer in frames.
- [animation.ts:73](../client/src/modules/pets/engine/animation.ts#L73) reassigns `backgroundImage` every frame even when the behavior hasn't changed. Cheap but pointless; set it only when the behavior transitions.
- [usePetEngine.ts:7‑9](../client/src/modules/pets/hooks/usePetEngine.ts#L7-L9) calls `setEngine(...)` during render rather than using `useState`'s lazy initializer. Works, but spurious extra render. Use `useState(() => new PetEngine())`.
- [physics.ts:11‑31](../client/src/modules/pets/engine/physics.ts#L11-L31) reads `window.innerWidth`/`innerHeight` every frame, doesn't react to resize cleanly, and `resolveScreenBounds` ([collisions.ts:60‑80](../client/src/modules/pets/engine/collisions.ts#L60-L80)) duplicates the same logic with a different effect (mutates `vx`, not `targetVx`). Pick one.
- `_animationState` lives on the Pet object itself, which is fine for now, but means serializing a Pet across the network will round‑trip render state. Keep render‑only state in a parallel `Map<id, RenderState>` on the engine before going server‑authoritative.

---

## 3. Minimal patch to make the current pet move on prod

If you just want the cat working today (no lootboxes yet), the smallest possible diff:

**[engine/PetEngine.ts](../client/src/modules/pets/engine/PetEngine.ts)** — never bail on an empty array, and de‑dupe by id:

```ts
addPet(pet: Pet) {
    if (this.pets.some(p => p.id === pet.id)) return
    this.pets.push(pet)
}

start() {
    if (this.running) return
    this.running = true

    const loop = (time: number) => {
        if (!this.running) return
        const deltaTime = time - this.lastTime
        this.lastTime = time

        for (const pet of this.pets) {
            updateBehavior(pet, deltaTime)
            updatePhysics(pet)
            resolveScreenBounds(pet)
            updateAnimation(pet, deltaTime)
        }
        for (let i = 0; i < this.pets.length; i++) {
            for (let j = i + 1; j < this.pets.length; j++) {
                resolvePetCollision(this.pets[i], this.pets[j])
            }
        }
        for (const pet of this.pets) {
            if (!pet.element) continue
            pet.element.style.transform =
                `translate(${pet.x}px, ${pet.y}px) scaleX(${pet.direction})`
        }
        requestAnimationFrame(loop)
    }
    this.lastTime = performance.now()
    requestAnimationFrame(loop)
}
```

**[hooks/usePetEngine.ts](../client/src/modules/pets/hooks/usePetEngine.ts)** — make the engine a true module singleton so HMR + StrictMode don't create two:

```ts
import { useEffect } from 'react'
import { PetEngine } from '../engine/PetEngine'

const engine = new PetEngine()

export function usePetEngine() {
    useEffect(() => {
        engine.start()
        return () => engine.stop()
    }, [])
    return engine
}
```

**[engine/behaviors.ts](../client/src/modules/pets/engine/behaviors.ts)** — delete the `console.log`, take `deltaTime`, and use it:

```ts
export function updateBehavior(pet: Pet, deltaTime: number) {
    if (pet.behaviorTimer === undefined) chooseBehavior(pet)
    pet.behaviorTimer! -= deltaTime
    if (pet.behaviorTimer! <= 0) chooseBehavior(pet)
    // …switch unchanged
}
```

That patch alone fixes both Bug A and Bug B in production and dev.

---

## 4. Refactor: content‑driven, extensible pet system

The current `Pet` interface mixes three concerns: **identity** (`id`), **definition** (`width`, `height`, `behaviors`, `speed`, sprite sheets), and **runtime state** (`x`, `y`, `vx`, `direction`, `_animationState`). To get "lots of pets with lots of behaviors with different rarities" we separate them.

### 4.0 The model as shipped today (verbatim)

This is the **actual** [`models/pet.ts`](../client/src/modules/pets/models/pet.ts) at the current commit — the thing the refactor below replaces. Everything in the engine (`behaviors.ts`, `physics.ts`, `collisions.ts`, `animation.ts`) operates on this single flat shape:

```ts
export type BehaviorTypes = "idle" | "walk" | "follow" | "sleep";

export type PetBehavior = Array<BehaviorTypes>;

export interface Pet {
    id: string;

    x: number;
    y: number;

    vx: number;
    vy: number;

    targetVx: number;
    targetVy: number;

    width: number;
    height: number;

    direction: 1 | -1;

    behaviorTimer?: number;
    currentBehavior: BehaviorTypes;
    behaviors: PetBehavior;

    speed: number;

    targetX?: number;
    targetY?: number;

    element?: HTMLDivElement;

    _animationState?: { frame: number; timer: number };
}
```

Notes that matter for the refactor:

- **`behaviors` is per-instance**, not per-species — the example cat hardcodes `['walk', 'idle', 'follow', 'sleep', 'walk', 'walk']` in [index.tsx:21](../client/src/modules/pets/index.tsx#L21) (duplicates act as weights — `walk` is 3× as likely). §4.1 lifts this to `PetSpecies.behaviorBag`.
- **The four behavior ids are `idle` / `walk` / `follow` / `sleep`.** The refactor renames `walk` → `wander` and `follow` → `follow_cursor` (more behaviors become possible once they're plugins). When you read `wander`/`follow_cursor` below, those are the *post-refactor* ids; today's code says `walk`/`follow`.
- **`_animationState` lives on the `Pet` object** ([animation.ts:50‑57](../client/src/modules/pets/engine/animation.ts#L50-L57)). `RuntimePet` keeps it, but §4 recommends moving render-only state into a parallel map before the model ever crosses the network.
- **`speed` is a flat `number`** (the example cat uses `0.2`). It becomes `PetSpecies.defaultSpeed`.
- There is **no `nickname`, `instanceId`, `speciesId`, or any server identity** — the only id is the client-side `id: 'cat-1'`.

### 4.1 Concepts

- **PetSpecies** — static definition of a kind of pet. Server‑owned, immutable per release. e.g. `species_id = "shadow_fox"`. Defines sprite sheets, animations, default behavior bag, speed, hitbox, rarity, display name, lore.
- **Behavior** — a small named state machine plugin. e.g. `idle`, `wander`, `follow_cursor`, `chase_other_pet`, `sleep`, `dash`, `teleport`, `emote_heart`. Registered in a behavior registry; species reference them by id.
- **PetInstance** — the user's owned pet. Server row: `(user_id, species_id, instance_id, nickname, unlocked_at, active)`.
- **RuntimePet** — purely on the client; the species merged with the instance plus mutable runtime state. The engine only ever sees `RuntimePet`s.

### 4.2 New types

**[client/src/modules/pets/models/pet.ts](../client/src/modules/pets/models/pet.ts)** (replace):

```ts
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

// Static, content-defined
export interface PetSpecies {
    speciesId: string                       // "shadow_fox"
    displayName: string                     // "Shadow Fox"
    rarity: Rarity
    width: number
    height: number
    hitboxInset?: { x: number; y: number }  // optional tighter collision
    defaultSpeed: number
    behaviorBag: BehaviorId[]               // weighted pool for chooseBehavior
    behaviorWeights?: Partial<Record<BehaviorId, number>>
    animations: Record<BehaviorId, AnimationConfig>
    spriteSheets: Record<BehaviorId, string> // resolved URLs (signed if gated)
    soundCues?: Partial<Record<BehaviorId, string>>
}

export interface AnimationConfig {
    frameWidth: number
    frameHeight: number
    frames: number
    fps: number
    loop?: boolean
}

// Server inventory row
export interface PetInstance {
    instanceId: string                      // uuid
    speciesId: string
    nickname?: string
    unlockedAt: string                      // ISO
    active: boolean                         // is currently following user on-screen
}

// Engine runtime
export interface RuntimePet {
    instanceId: string
    species: PetSpecies
    x: number; y: number
    vx: number; vy: number
    targetVx: number; targetVy: number
    direction: 1 | -1
    currentBehavior: BehaviorId
    behaviorTimer: number                   // ms remaining
    targetX?: number; targetY?: number
    element?: HTMLDivElement
}

export type BehaviorId = string             // free-form so plugins can add
```

### 4.3 Behavior registry

**`client/src/modules/pets/engine/behaviorRegistry.ts`** (new):

```ts
import type { RuntimePet } from '../models/pet'

export interface BehaviorDef {
    id: string
    enter?: (pet: RuntimePet) => void
    update: (pet: RuntimePet, dt: number) => void
    exit?:  (pet: RuntimePet) => void
    minDurationMs?: number                  // default 4000
    maxDurationMs?: number                  // default 7000
}

const registry = new Map<string, BehaviorDef>()
export const registerBehavior = (b: BehaviorDef) => registry.set(b.id, b)
export const getBehavior = (id: string) => registry.get(id)
export const allBehaviors = () => [...registry.values()]
```

Built‑ins (`engine/behaviors/*.ts`) just call `registerBehavior(...)` at import time. Adding a new behavior is one file + one import.

**Example — `wander`:**

```ts
registerBehavior({
    id: 'wander',
    update(pet, dt) {
        if (Math.random() < 0.002 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s
            pet.targetVy = (Math.random() * 2 - 1) * s * 0.3
        }
    },
    minDurationMs: 3000,
    maxDurationMs: 8000,
})
```

**Example — `follow_cursor`:**

```ts
let cursor = { x: 0, y: 0 }
window.addEventListener('mousemove', e => { cursor.x = e.clientX; cursor.y = e.clientY })

registerBehavior({
    id: 'follow_cursor',
    update(pet, dt) {
        const dx = cursor.x - pet.x
        const dy = cursor.y - pet.y
        const d = Math.hypot(dx, dy)
        if (d < 40) { pet.targetVx = pet.targetVy = 0; return }
        const s = pet.species.defaultSpeed
        pet.targetVx = (dx / d) * s
        pet.targetVy = (dy / d) * s
    },
    minDurationMs: 6000,
    maxDurationMs: 12000,
})
```

The FSM driver becomes:

```ts
export function updateBehavior(pet: RuntimePet, dt: number) {
    pet.behaviorTimer -= dt
    if (pet.behaviorTimer <= 0) {
        const old = getBehavior(pet.currentBehavior)
        old?.exit?.(pet)
        pet.currentBehavior = pickWeighted(pet.species)
        const next = getBehavior(pet.currentBehavior)
        next?.enter?.(pet)
        pet.behaviorTimer =
            (next?.minDurationMs ?? 4000) +
            Math.random() * ((next?.maxDurationMs ?? 7000) - (next?.minDurationMs ?? 4000))
    }
    getBehavior(pet.currentBehavior)?.update(pet, dt)
}
```

`pickWeighted` is the successor to today's `chooseBehavior` ([behaviors.ts:35‑39](../client/src/modules/pets/engine/behaviors.ts#L35-L39)), which does a flat `behaviors[Math.floor(Math.random() * behaviors.length)]`. The new version respects both duplicates-as-weight (kept from today) and the optional `behaviorWeights` multiplier:

```ts
function pickWeighted(species: PetSpecies): BehaviorId {
    const bag = species.behaviorBag
    const overrides = species.behaviorWeights ?? {}
    // A duplicate in the bag already counts once per appearance; the optional
    // override multiplies that. e.g. bag=['idle','wander','wander'] with
    // {wander: 0.5} → effective weights idle:1, wander:0.5, wander:0.5.
    const entries = bag.map(id => [id, overrides[id] ?? 1] as const)
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    if (total <= 0) return bag[0]
    let r = Math.random() * total
    for (const [id, w] of entries) {
        r -= w
        if (r <= 0) return id
    }
    return bag[bag.length - 1]
}
```

### 4.4 Species manifest

Species are **delivered from the server** so you don't need a client deploy to add a pet. The client fetches `/pets/species` on app start; the response includes sprite‑sheet URLs that are signed/gated for any species the user owns (see §8). For species the user does *not* own, the manifest only includes display metadata + a low‑res "silhouette" preview URL — never the real sprite.

```jsonc
// GET /pets/species  →
{
  "species": [
    {
      "speciesId": "shadow_fox",
      "displayName": "Shadow Fox",
      "rarity": "epic",
      "width": 64, "height": 64,
      "defaultSpeed": 0.4,
      "behaviorBag": ["idle","wander","follow_cursor","sleep"],
      "animations": {
        "idle":   { "frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 4 },
        "wander": { "frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 6 },
        ...
      },
      "owned": true,
      "spriteSheets": {
        "idle":   "/pets/assets/shadow_fox/idle.png?sig=...&exp=...",
        ...
      }
    },
    {
      "speciesId": "lava_slime",
      "displayName": "Lava Slime",
      "rarity": "legendary",
      "owned": false,
      "previewUrl": "/pets/assets/_silhouettes/lava_slime.png"
      // no spriteSheets, no real animations
    }
  ]
}
```

---

## 5. Backend: pet catalog, inventory, and asset gating

All code goes in [fastapi-server/app/](../fastapi-server/app).

### 5.1 Data model

**`app/models/pet_species.py`** — optional table; you can also keep species in a Python constant à la [`THEMES`](../fastapi-server/app/consts/themes.py). A DB row is better once you want to A/B drop rates or hot‑add species.

```python
from sqlalchemy import String, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PetSpecies(Base):
    __tablename__ = "pet_species"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    species_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    rarity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    default_speed_x100: Mapped[int] = mapped_column(Integer, nullable=False) # 40 → 0.40
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    # config holds behaviorBag, animations, assetKeys, soundCues, etc.
    enabled: Mapped[bool] = mapped_column(default=True)
```

**`app/models/pet_instances.py`**:

```python
from sqlalchemy import String, Integer, ForeignKey, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
import uuid

class PetInstance(Base):
    __tablename__ = "pet_instances"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    instance_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    species_id: Mapped[str] = mapped_column(String(64), index=True)  # FK to pet_species.species_id
    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    unlocked_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
    active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    source: Mapped[str] = mapped_column(String(32), nullable=False)  # "lootbox:basic", "grant", etc.
```

**`app/models/lootbox.py`** — defines available lootbox SKUs:

```python
class Lootbox(Base):
    __tablename__ = "lootboxes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(32), unique=True)    # "basic", "gold", "shadow"
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    price_points: Mapped[int] = mapped_column(Integer, nullable=False)
    drop_table: Mapped[dict] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True)
```

`drop_table` is the **server‑authoritative** distribution:

```jsonc
{
  "rarities": { "common": 70, "uncommon": 20, "rare": 8, "epic": 1.9, "legendary": 0.1 },
  "speciesByRarity": {
    "common":    ["cat", "pug"],
    "uncommon":  ["husky", "tabby"],
    "rare":      ["shiba"],
    "epic":      ["shadow_fox"],
    "legendary": ["lava_slime"]
  },
  "pityAfterOpens": 50,
  "pityFloor": "epic"
}
```

**`app/models/lootbox_open.py`** — audit log + pity counter:

```python
class LootboxOpen(Base):
    __tablename__ = "lootbox_opens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sku: Mapped[str] = mapped_column(String(32))
    rolled_rarity: Mapped[str] = mapped_column(String(16))
    rolled_species: Mapped[str] = mapped_column(String(64))
    pet_instance_id: Mapped[int | None] = mapped_column(ForeignKey("pet_instances.id"))
    cost_points: Mapped[int] = mapped_column(Integer)
    server_seed_hash: Mapped[str] = mapped_column(String(64))    # commit-reveal optional
    opened_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

Add migrations via Alembic — same flow as the existing themes/user_themes migrations under [fastapi-server/app/migrations/versions/](../fastapi-server/app/migrations/versions/).

### 5.2 CRUD

`app/crud/pets.py`:

```python
from sqlalchemy.orm import Session
from app.models.pet_instances import PetInstance

def list_user_instances(db: Session, user_id: int) -> list[PetInstance]:
    return db.query(PetInstance).filter_by(user_id=user_id).all()

def get_instance_for_user(db: Session, user_id: int, instance_id: str) -> PetInstance | None:
    # ownership-scoped lookup — returns None for someone else's pet (callers 404, don't 403)
    return db.query(PetInstance).filter_by(user_id=user_id, instance_id=instance_id).first()

def create_instance(db: Session, user_id: int, species_id: str, source: str) -> PetInstance:
    inst = PetInstance(user_id=user_id, species_id=species_id, source=source)
    db.add(inst); db.commit(); db.refresh(inst); return inst

def set_active(db: Session, user_id: int, instance_id: str, active: bool) -> PetInstance:
    inst = db.query(PetInstance).filter_by(user_id=user_id, instance_id=instance_id).one()
    inst.active = active; db.commit(); db.refresh(inst); return inst
```

> `get_instance_for_user` is the ownership gate reused by the interaction endpoints in [pet-interaction.md](./pet-interaction.md). It scopes by `user_id`, so a request for another user's pet returns `None` → 404 (don't leak existence with a 403).

`app/crud/lootboxes.py`:

```python
from sqlalchemy.orm import Session
from app.models.lootbox import Lootbox
from app.models.lootbox_open import LootboxOpen

RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"]

def get_lootbox(db: Session, sku: str) -> Lootbox | None:
    return db.query(Lootbox).filter_by(sku=sku, enabled=True).first()

def list_enabled(db: Session) -> list[Lootbox]:
    return db.query(Lootbox).filter_by(enabled=True).all()

def count_opens_since_last_high(db: Session, user_id: int, sku: str, floor: str) -> int:
    """How many of this SKU the user has opened since they last hit `floor`
    rarity or above. Drives the pity timer in roll()."""
    floor_idx = RARITY_ORDER.index(floor)
    high_rarities = RARITY_ORDER[floor_idx:]

    # Most recent open at or above the floor → everything after it counts as a miss.
    last_high = (
        db.query(LootboxOpen)
        .filter(
            LootboxOpen.user_id == user_id,
            LootboxOpen.sku == sku,
            LootboxOpen.rolled_rarity.in_(high_rarities),
        )
        .order_by(LootboxOpen.opened_at.desc())
        .first()
    )

    q = db.query(LootboxOpen).filter(
        LootboxOpen.user_id == user_id,
        LootboxOpen.sku == sku,
    )
    if last_high is not None:
        q = q.filter(LootboxOpen.opened_at > last_high.opened_at)

    return q.count()
```

### 5.3 Routes

`app/routes/pets.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud import pets as pets_crud
from app.models.pet_species import PetSpecies
from app.services.pet_assets import sign_sprite_url  # see §8

router = APIRouter(prefix="/pets", tags=["pets"])

@router.get("/species")
def species(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    owned_species = {i.species_id for i in pets_crud.list_user_instances(db, session.user_id)}

    out = []
    for s in db.query(PetSpecies).filter_by(enabled=True).all():
        owned = s.species_id in owned_species
        entry = {
            "speciesId": s.species_id,
            "displayName": s.display_name,
            "rarity": s.rarity,
            "width": s.width, "height": s.height,
            "defaultSpeed": s.default_speed_x100 / 100,
            **s.config,                      # behaviorBag, animations, etc.
            "owned": owned,
        }
        if owned:
            entry["spriteSheets"] = {
                beh: sign_sprite_url(session.user_id, s.species_id, beh)
                for beh in s.config["animations"].keys()
            }
        else:
            entry["previewUrl"] = f"/pets/assets/_silhouettes/{s.species_id}.png"
        out.append(entry)
    return {"ok": True, "species": out}

@router.get("/inventory")
def inventory(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    return {"ok": True, "pets": [
        {
            "instanceId": p.instance_id,
            "speciesId":  p.species_id,
            "nickname":   p.nickname,
            "unlockedAt": p.unlocked_at.isoformat(),
            "active":     p.active,
        }
        for p in pets_crud.list_user_instances(db, session.user_id)
    ]}

class SetActiveBody(BaseModel):
    active: bool

@router.post("/{instance_id}/active")
def set_active(instance_id: str, body: SetActiveBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    inst = pets_crud.set_active(db, session.user_id, instance_id, body.active)
    return {"ok": True, "active": inst.active}
```

Register in [main.py](../fastapi-server/app/main.py#L4):

```python
from app.routes import blackjack, messages, points, themes, users, ws, leaderboard, pets, lootboxes
app.include_router(pets.router)
app.include_router(lootboxes.router)
```

---

## 6. Lootboxes: server‑authoritative rolls

**The client never decides what you got.** It POSTs "open this SKU", the server debits points, rolls with its own RNG against the persisted `drop_table`, creates a `PetInstance`, and returns it. The client then refetches `/pets/species` so the newly owned species comes back with signed sprite URLs.

### 6.1 Roll algorithm

`app/services/lootbox_roll.py`:

```python
import secrets, hashlib
from sqlalchemy.orm import Session
from app.models.lootbox import Lootbox
from app.crud.lootboxes import count_opens_since_last_high

RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"]

def roll(db: Session, user_id: int, box: Lootbox) -> tuple[str, str, str]:
    """Returns (rarity, species_id, server_seed_hash)."""
    seed = secrets.token_bytes(32)
    seed_hash = hashlib.sha256(seed).hexdigest()

    # 1. Pity: if user has opened more than `pityAfterOpens` of this SKU
    # without hitting `pityFloor` or above, force at least `pityFloor`.
    pity_after = box.drop_table.get("pityAfterOpens")
    pity_floor = box.drop_table.get("pityFloor")
    forced_floor_idx = None
    if pity_after and pity_floor:
        misses = count_opens_since_last_high(db, user_id, box.sku, pity_floor)
        if misses >= pity_after:
            forced_floor_idx = RARITY_ORDER.index(pity_floor)

    # 2. Roll rarity from weighted distribution
    rarities = box.drop_table["rarities"]
    total = sum(rarities.values())
    r = (int.from_bytes(seed[:8], "big") / 2**64) * total
    rarity = "common"
    acc = 0.0
    for name, weight in rarities.items():
        acc += weight
        if r <= acc:
            rarity = name
            break

    if forced_floor_idx is not None:
        if RARITY_ORDER.index(rarity) < forced_floor_idx:
            rarity = RARITY_ORDER[forced_floor_idx]

    # 3. Roll species within rarity
    pool: list[str] = box.drop_table["speciesByRarity"][rarity]
    pick = int.from_bytes(seed[8:16], "big") % len(pool)
    species_id = pool[pick]

    return rarity, species_id, seed_hash
```

`secrets.token_bytes` is CSPRNG; the server seed hash is logged so you can prove non‑manipulation after the fact (commit‑reveal — optional).

### 6.2 Route — `app/routes/lootboxes.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud.user_points import get_points_by_user_id, update_user_points
from app.crud import lootboxes as lb_crud, pets as pets_crud
from app.models.lootbox_open import LootboxOpen
from app.services.lootbox_roll import roll
from app.services.pet_assets import sign_sprite_urls_for_species

router = APIRouter(prefix="/lootboxes", tags=["lootboxes"])

@router.get("")
def list_boxes(request: Request, db = Depends(get_db)):
    get_session_from_request(db, request)
    boxes = lb_crud.list_enabled(db)
    return {"ok": True, "boxes": [
        {
            "sku": b.sku,
            "displayName": b.display_name,
            "pricePoints": b.price_points,
            # NEVER expose drop_table to client — odds are server-only
            # if you want to show odds, expose a sanitized view:
            "odds": {k: v for k, v in b.drop_table["rarities"].items()},
        }
        for b in boxes
    ]}

@router.post("/{sku}/open")
def open_box(sku: str, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    box = lb_crud.get_lootbox(db, sku)
    if not box:
        raise HTTPException(404, "Unknown lootbox")

    # Begin transaction: debit -> roll -> create instance -> audit
    try:
        with db.begin_nested():
            pts = get_points_by_user_id(db, session.user_id)
            if pts.points < box.price_points:
                raise HTTPException(400, "Not enough points")
            update_user_points(db, session.user_id, pts.points - box.price_points)

            rarity, species_id, seed_hash = roll(db, session.user_id, box)
            instance = pets_crud.create_instance(
                db, session.user_id, species_id, source=f"lootbox:{sku}"
            )
            db.add(LootboxOpen(
                user_id=session.user_id,
                sku=sku,
                rolled_rarity=rarity,
                rolled_species=species_id,
                pet_instance_id=instance.id,
                cost_points=box.price_points,
                server_seed_hash=seed_hash,
            ))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(500, "Could not open lootbox")

    return {
        "ok": True,
        "rolled": {
            "rarity": rarity,
            "speciesId": species_id,
            "instanceId": instance.instance_id,
            # Sprite URLs are signed here so the client can immediately render it
            "spriteSheets": sign_sprite_urls_for_species(db, session.user_id, species_id),
        },
        "pointsRemaining": pts.points - box.price_points,
    }
```

Notes:

- **One transaction** for debit + grant + audit. If anything fails, the user keeps their points.
- **Odds are server‑side**. The catalog endpoint exposes per‑rarity probability for transparency, but never the species pool or pity rules — those are tuning knobs that should stay private.
- The 165‑score cap pattern in [routes/points.py:36](../fastapi-server/app/routes/points.py#L36) suggests there's existing concern about points inflation; lootboxes are the **sink** for that economy.

### 6.3 Optional: rate‑limit and idempotency

- Wrap `/lootboxes/{sku}/open` in a per‑user lock or use `SELECT ... FOR UPDATE` on the points row so two concurrent opens can't double‑spend.
- Require an `Idempotency-Key` header from the client; cache `(user_id, key) → response` for 5 minutes so a network retry doesn't open two boxes.

---

## 7. Frontend: inventory, store, opening flow

### 7.1 Hooks

> **API base URL convention.** This codebase talks to FastAPI directly via `import.meta.env.VITE_FASTAPI_API_URL` with `credentials: 'include'` — there is **no `/api` proxy**. See [`usePoints`](../client/src/modules/points/hooks/usePoints.tsx#L32-L35) and [`ThemeShop`](../client/src/modules/themes/index.tsx#L36) for the pattern. A shared `serverUrl` already exists in [`client/src/utils/env.ts`](../client/src/utils/env.ts). All pet hooks below follow that convention.

First, the shared response/value types these hooks return (extend `models/pet.ts`):

```ts
// models/pet.ts — additions
export interface SpeciesEntry extends PetSpecies {
    owned: boolean
    previewUrl?: string      // present only when !owned
}

export interface LootboxSummary {
    sku: string
    displayName: string
    pricePoints: number
    odds: Record<Rarity, number>   // sanitized per-rarity weights (NOT the species pool)
}

export interface LootboxOpenResult {
    ok: true
    rolled: {
        rarity: Rarity
        speciesId: string
        instanceId: string
        spriteSheets: Record<BehaviorId, string>
    }
    pointsRemaining: number
}
```

`client/src/modules/pets/hooks/usePetSpecies.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'
import type { SpeciesEntry } from '../models/pet'

export function usePetSpecies() {
    const [species, setSpecies] = useState<SpeciesEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const fetchSpecies = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const res = await fetch(`${serverUrl}/pets/species`, { credentials: 'include' })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            if (!data.ok) throw new Error('Failed to load species')
            setSpecies(data.species)
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'))
        } finally {
            setLoading(false)
        }
    }, [])

    // Refetch on focus so signed sprite URLs stay fresh (they expire after ASSET_TTL).
    useEffect(() => {
        fetchSpecies()
        window.addEventListener('focus', fetchSpecies)
        return () => window.removeEventListener('focus', fetchSpecies)
    }, [fetchSpecies])

    return { species, loading, error, refetch: fetchSpecies }
}
```

`client/src/modules/pets/hooks/usePetInventory.ts` — owns the user's instances and the active toggle:

```ts
import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'
import type { PetInstance } from '../models/pet'

export function usePetInventory() {
    const [inventory, setInventory] = useState<PetInstance[]>([])
    const [loading, setLoading] = useState(false)

    const fetchInventory = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`${serverUrl}/pets/inventory`, { credentials: 'include' })
            const data = await res.json()
            if (data.ok) setInventory(data.pets)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchInventory() }, [fetchInventory])

    const setActive = useCallback(async (instanceId: string, active: boolean) => {
        // optimistic
        setInventory(prev =>
            prev.map(p => (p.instanceId === instanceId ? { ...p, active } : p)))
        try {
            const res = await fetch(`${serverUrl}/pets/${instanceId}/active`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active }),
            })
            if (!res.ok) throw new Error('failed')
        } catch {
            await fetchInventory()   // rollback to server truth
        }
    }, [fetchInventory])

    return { inventory, loading, setActive, refetch: fetchInventory }
}
```

`client/src/modules/pets/hooks/useLootboxes.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'
import type { LootboxSummary, LootboxOpenResult } from '../models/pet'

export function useLootboxes() {
    const [boxes, setBoxes] = useState<LootboxSummary[]>([])
    const [opening, setOpening] = useState(false)

    const fetchBoxes = useCallback(async () => {
        const res = await fetch(`${serverUrl}/lootboxes`, { credentials: 'include' })
        const data = await res.json()
        if (data.ok) setBoxes(data.boxes)
    }, [])

    useEffect(() => { fetchBoxes() }, [fetchBoxes])

    const open = useCallback(async (sku: string): Promise<LootboxOpenResult> => {
        setOpening(true)
        try {
            const res = await fetch(`${serverUrl}/lootboxes/${sku}/open`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': crypto.randomUUID(),
                },
                credentials: 'include',
            })
            const data = await res.json()
            if (!res.ok || !data.ok) throw new Error(data.detail ?? 'open failed')
            return data as LootboxOpenResult
        } finally {
            setOpening(false)
        }
    }, [])

    return { boxes, open, opening, refetch: fetchBoxes }
}
```

### 7.2 Wiring active pets into the engine

First, the factory that merges a server `PetInstance` with its `PetSpecies` into the engine's `RuntimePet`.

`client/src/modules/pets/engine/factory.ts` (new):

```ts
import type { PetInstance, PetSpecies, RuntimePet } from '../models/pet'

export function toRuntimePet(instance: PetInstance, species: PetSpecies): RuntimePet {
    return {
        instanceId: instance.instanceId,
        species,
        x: Math.random() * (window.innerWidth - species.width),
        y: window.innerHeight - species.height - 20,
        vx: 0, vy: 0,
        targetVx: 0, targetVy: 0,
        direction: 1,
        currentBehavior: species.behaviorBag[0] ?? 'idle',
        behaviorTimer: 0,          // 0 → updateBehavior picks a behavior on the first frame
    }
}
```

Then replace [index.tsx](../client/src/modules/pets/index.tsx) (which hardcodes `examplePet`) with a component that materialises pets from the inventory + species map:

```tsx
import { useEffect, useMemo } from 'react'
import { PetSprite } from './components/PetSprite'
import { usePets } from './hooks/usePets'
import { usePetSpecies } from './hooks/usePetSpecies'
import { usePetInventory } from './hooks/usePetInventory'
import { toRuntimePet } from './engine/factory'
import type { RuntimePet } from './models/pet'

export function Pets() {
    const { species }   = usePetSpecies()
    const { inventory } = usePetInventory()
    const { syncPets, pets } = usePets()

    const active = useMemo<RuntimePet[]>(
        () => inventory
            .filter(i => i.active)
            .map(i => {
                const s = species.find(s => s.speciesId === i.speciesId)
                // only owned species carry signed spriteSheets; unowned can't render
                return s && s.owned ? toRuntimePet(i, s) : null
            })
            .filter((p): p is RuntimePet => p !== null),
        [species, inventory],
    )

    useEffect(() => { syncPets(active) }, [active, syncPets])

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
            {pets.map(p => <PetSprite key={p.instanceId} pet={p} />)}
        </div>
    )
}
```

`syncPets(targets)` on the engine becomes the single source of truth (replaces the `addPet` / `removePet` racing in today's [usePets.ts](../client/src/modules/pets/hooks/usePets.ts) + [index.tsx](../client/src/modules/pets/index.tsx)):

```ts
// engine/PetEngine.ts
syncPets(targets: RuntimePet[]) {
    const wanted = new Set(targets.map(t => t.instanceId))
    // drop pets that are no longer active
    this.pets = this.pets.filter(p => wanted.has(p.instanceId))
    // add newly-active pets (preserve existing runtime state for ones already present)
    for (const t of targets) {
        if (!this.pets.some(p => p.instanceId === t.instanceId)) this.pets.push(t)
    }
}
```

And `usePets` exposes it (replacing today's `addPet`/`removePet`):

```ts
// hooks/usePets.ts
import { useCallback, useState } from 'react'
import { usePetEngine } from './usePetEngine'
import type { RuntimePet } from '../models/pet'

export function usePets() {
    const engine = usePetEngine()
    const [, setTick] = useState(0)

    const syncPets = useCallback((targets: RuntimePet[]) => {
        engine.syncPets(targets)
        setTick(t => t + 1)        // re-render so PetSprite list matches engine.pets
    }, [engine])

    return { syncPets, pets: engine.pets }
}
```

> Note `usePetEngine` must return a non-null module-level singleton (see the §3 patch) so `engine` is never `null` here.

### 7.3 Lootbox UI

This codebase already has a modal system ([`useModal`](../client/src/components/modal/ModalContext.tsx)) and a points context ([`usePointsContext`](../client/src/modules/points/contexts/PointsContext.tsx)). The lootbox UI reuses both, mirroring [`ThemeShop`](../client/src/modules/themes/index.tsx).

**`client/src/modules/pets/components/rarity.ts`** — shared rarity → colour map (used by store + reveal):

```ts
import type { Rarity } from '../models/pet'

export const RARITY_COLOR: Record<Rarity, string> = {
    common:    '#9ca3af',  // gray-400
    uncommon:  '#22c55e',  // green-500
    rare:      '#3b82f6',  // blue-500
    epic:      '#a855f7',  // purple-500
    legendary: '#f59e0b',  // amber-500
}
```

**`client/src/modules/pets/components/LootboxStore.tsx`** — grid of boxes; click → reveal modal → `open()`:

```tsx
import { useModal } from '../../../components/modal/ModalContext'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { useLootboxes } from '../hooks/useLootboxes'
import { LootboxRevealModal } from './LootboxRevealModal'
import { RARITY_COLOR } from './rarity'
import type { Rarity } from '../models/pet'

export function LootboxStore({ onOpened }: { onOpened?: () => void }) {
    const { boxes, open, opening } = useLootboxes()
    const { points, fetchPoints } = usePointsContext()
    const { openModal } = useModal()

    const handleOpen = async (sku: string) => {
        if (opening) return
        try {
            const result = await open(sku)
            await fetchPoints()            // points were debited server-side
            onOpened?.()                   // let parent refetch inventory/species
            openModal(<LootboxRevealModal result={result} />)
        } catch (err) {
            openModal(
                <p className="text-red-400 p-4">
                    {(err as Error).message}
                </p>,
            )
        }
    }

    return (
        <div className="flex items-center justify-center p-8 [background:var(--bg)] rounded-xl border">
            <div className="w-full max-w-md">
                <h2 className="text-xl font-semibold mb-1 text-center">Lootboxes</h2>
                <h3 className="text-center mb-4 underline font-bold">Points: {points}</h3>

                <div className="flex flex-col gap-3">
                    {boxes.map(box => {
                        const isBroke = points != null && points < box.pricePoints
                        return (
                            <div key={box.sku} className="border rounded-xl p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-semibold">{box.displayName}</span>
                                    <button
                                        onClick={() => handleOpen(box.sku)}
                                        disabled={isBroke || opening}
                                        className={`text-black rounded-xl px-3 py-1 transition-colors duration-100 ${
                                            isBroke ? 'bg-teal-900 cursor-default' : 'bg-green-600 hover:bg-green-800'
                                        }`}
                                    >
                                        {opening ? '...' : `Open · ${box.pricePoints}`}
                                    </button>
                                </div>
                                {/* transparency: sanitized per-rarity odds from the server */}
                                <div className="flex gap-2 text-xs">
                                    {(Object.entries(box.odds) as [Rarity, number][])
                                        .filter(([, w]) => w > 0)
                                        .map(([rarity, weight]) => (
                                            <span key={rarity} style={{ color: RARITY_COLOR[rarity] }}>
                                                {rarity} {pct(weight, box.odds)}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// weights are relative; normalize to a % for display
function pct(weight: number, odds: Record<string, number>) {
    const total = Object.values(odds).reduce((a, b) => a + b, 0)
    return total ? `${((weight / total) * 100).toFixed(1)}%` : '—'
}
```

**`client/src/modules/pets/components/LootboxRevealModal.tsx`** — rarity-coloured reveal that animates the just-won pet using the sprite sheets the open response already returned (no `/pets/species` round-trip):

```tsx
import { useEffect, useRef, useState } from 'react'
import { useModal } from '../../../components/modal/ModalContext'
import { usePetInventory } from '../hooks/usePetInventory'
import { animations } from '../engine/animation'
import { RARITY_COLOR } from './rarity'
import type { LootboxOpenResult } from '../models/pet'

export function LootboxRevealModal({ result }: { result: LootboxOpenResult }) {
    const { rarity, speciesId, instanceId, spriteSheets } = result.rolled
    const { closeModal } = useModal()
    const { setActive, refetch } = usePetInventory()
    const [added, setAdded] = useState(false)

    // animate the idle sheet so the reveal feels alive (frame stepper, no engine needed)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const anim = animations.idle
        let frame = 0
        const id = setInterval(() => {
            if (!ref.current) return
            frame = (frame + 1) % anim.frames
            ref.current.style.backgroundPosition = `-${frame * anim.frameWidth}px 0px`
        }, 1000 / anim.fps)
        return () => clearInterval(id)
    }, [spriteSheets])

    const addToParty = async () => {
        await setActive(instanceId, true)
        await refetch()
        setAdded(true)
    }

    return (
        <div
            className="flex flex-col items-center gap-4 p-8 rounded-xl"
            style={{ boxShadow: `0 0 40px ${RARITY_COLOR[rarity]}` }}
        >
            <span className="uppercase tracking-widest font-bold" style={{ color: RARITY_COLOR[rarity] }}>
                {rarity}
            </span>

            <div
                ref={ref}
                style={{
                    width: animations.idle.frameWidth,
                    height: animations.idle.frameHeight,
                    transform: 'scale(2)',
                    imageRendering: 'pixelated',
                    backgroundImage: `url(${spriteSheets.idle ?? Object.values(spriteSheets)[0]})`,
                    backgroundRepeat: 'no-repeat',
                }}
            />

            <span className="font-semibold">{speciesId}</span>

            <div className="flex gap-2">
                <button
                    onClick={addToParty}
                    disabled={added}
                    className="text-black bg-green-600 hover:bg-green-800 rounded-xl px-4 py-1"
                >
                    {added ? 'Added!' : 'Add to party'}
                </button>
                <button onClick={closeModal} className="rounded-xl px-4 py-1 border">
                    Close
                </button>
            </div>
        </div>
    )
}
```

The reveal uses **the sprite sheets the server signed and returned in the open response** — don't wait for a `/pets/species` refetch. The `LootboxStore`'s `onOpened` callback (or the parent's `usePetSpecies().refetch`) refreshes the rest of the catalog afterward so the newly-owned species shows `owned: true` next time.

### 7.4 Sprite‑sheet loading

The asset URL is now an HTTP URL, not a Vite import. [components/PetSprite.tsx:25](../client/src/modules/pets/components/PetSprite.tsx#L25) becomes:

```tsx
backgroundImage: `url(${pet.species.spriteSheets[pet.currentBehavior]})`,
```

And `engine/animation.ts` switches sheets only on behavior transition (not every frame):

```ts
if (state.lastBehavior !== pet.currentBehavior) {
    pet.element.style.backgroundImage =
        `url(${pet.species.spriteSheets[pet.currentBehavior]})`
    state.lastBehavior = pet.currentBehavior
}
state.timer += dt
const frameDuration = 1000 / anim.fps
if (state.timer >= frameDuration) {
    state.timer -= frameDuration
    state.frame = (state.frame + 1) % anim.frames
}
pet.element.style.backgroundPosition = `-${state.frame * anim.frameWidth}px 0`
```

### 7.5 Removing the bundled cat assets

Once species come from the server, **delete** [client/src/modules/pets/assets/](../client/src/modules/pets/assets/) and its `metadata.ts`. Today they ship with every client bundle to every user regardless of ownership — that's the leak the user explicitly wants closed.

---

## 8. Security model

> "Keep assets on the backend and only give them to the frontend if they have unlocked them."

### 8.1 Storage layout

Real sprite sheets are stored **outside the client build**, in a directory the FastAPI server has access to (or an S3 bucket):

```
fastapi-server/pet_assets/
    shadow_fox/idle.png
    shadow_fox/wander.png
    ...
    _silhouettes/shadow_fox.png   # ok to serve publicly
```

Never include `fastapi-server/pet_assets/` in the client build pipeline.

### 8.2 Signed URLs (recommended)

Don't proxy bytes through Python per request — sign URLs and let your reverse proxy (nginx/caddy/CDN) serve them. The signature is HMAC over `(user_id, species_id, behavior, expiry)` using a server secret:

First add the two settings to [`app/config.py`](../fastapi-server/app/config.py). The existing `Env` is a `pydantic_settings.BaseSettings` with `case_sensitive=False`, so the env vars are `PET_ASSET_SECRET` / `PET_ASSETS_DIR` but the **Python attributes are lowercase** (`env.pet_asset_secret`) — same as the existing `env.database_url`:

```python
class Env(BaseSettings):
    database_url: str
    pet_asset_secret: str      # 32+ random bytes, from PET_ASSET_SECRET in .env
    pet_assets_dir: str        # absolute path to the sprite store, from PET_ASSETS_DIR

    model_config = SettingsConfigDict(
        env_file='.env', case_sensitive=False, extra='ignore'
    )
```

`app/services/pet_assets.py`:

```python
import hmac, hashlib, time, base64
from sqlalchemy.orm import Session
from app.config import env
from app.models.pet_species import PetSpecies

ASSET_TTL = 60 * 60   # 1 hour

def sign_sprite_url(user_id: int, species_id: str, behavior: str) -> str:
    exp = int(time.time()) + ASSET_TTL
    payload = f"{user_id}|{species_id}|{behavior}|{exp}"
    sig = hmac.new(env.pet_asset_secret.encode(), payload.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    return f"/pet-assets/{species_id}/{behavior}.png?uid={user_id}&exp={exp}&sig={sig_b64}"

def sign_sprite_urls_for_species(db: Session, user_id: int, species_id: str) -> dict[str, str]:
    species = db.query(PetSpecies).filter_by(species_id=species_id).one()
    return {
        beh: sign_sprite_url(user_id, species_id, beh)
        for beh in species.config["animations"].keys()
    }
```

> `sign_sprite_urls_for_species` now takes `db` so it can load the species' animation keys. Update the two callers in §6.2 (`sign_sprite_urls_for_species(db, session.user_id, species_id)`).

### 8.3 Verification

Two options:

**Option A — verify in FastAPI** (`app/routes/pet_assets.py`):

```python
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import FileResponse
import hmac, hashlib, base64, time, os
from app.config import env
from app.database import get_db
from app.models.pet_instances import PetInstance
from app.utils.session_tokens import get_session_from_request

router = APIRouter(prefix="/pet-assets", tags=["pet-assets"])

ASSETS_DIR = os.path.abspath(env.pet_assets_dir)

@router.get("/{species_id}/{behavior}.png")
def serve_sprite(species_id: str, behavior: str, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    try:
        uid = int(request.query_params["uid"])
        exp = int(request.query_params["exp"])
        sig = request.query_params["sig"]
    except (KeyError, ValueError):
        raise HTTPException(400, "Bad asset URL")

    if uid != session.user_id:                raise HTTPException(403)
    if exp < time.time():                     raise HTTPException(403, "Asset link expired")

    payload = f"{uid}|{species_id}|{behavior}|{exp}".encode()
    expected = base64.urlsafe_b64encode(
        hmac.new(env.pet_asset_secret.encode(), payload, hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    if not hmac.compare_digest(expected, sig): raise HTTPException(403)

    # Defense in depth: confirm the user actually owns this species.
    owned = db.query(PetInstance).filter_by(user_id=uid, species_id=species_id).first()
    if not owned: raise HTTPException(403)

    # Path traversal guard.
    abs_path = os.path.abspath(os.path.join(ASSETS_DIR, species_id, f"{behavior}.png"))
    if not abs_path.startswith(ASSETS_DIR + os.sep): raise HTTPException(400)
    if not os.path.isfile(abs_path):                 raise HTTPException(404)

    return FileResponse(abs_path, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})
```

**Option B — let nginx verify the signature** with a tiny Lua/njs module and serve the file directly. Faster, but more infra. Start with Option A; move to B if you ever see the asset route on a flame graph.

### 8.4 What the threat model is actually defending against

| Threat | Mitigation |
|---|---|
| User views Network tab, copies sprite URL, gives to a friend who doesn't own the pet | URL is bound to `uid` and HMAC‑signed; the friend's session won't match → 403. |
| User decompiles client bundle to find sprite URLs | There are no sprite URLs in the bundle — only the silhouettes are public. |
| User edits the client to call `addPet` directly with an unowned species | `/pets/species` doesn't return sheet URLs for unowned species, and rendering needs them. Worst case they get a broken image. **Visual presence does not equal ownership** — server side, only `pet_instances` rows matter. |
| User replays a successful `/lootboxes/{sku}/open` response and pretends they got a legendary | Lootbox results come from `/pets/inventory`, which is server‑sourced. The reveal payload is just a UI nicety. |
| User races two `/lootboxes/{sku}/open` calls hoping to spend points once and get two pets | Idempotency‑Key + per‑user lock + transactional debit (§6.3). |
| Asset link leaks to a public pastebin | TTL is 1 hour; after expiry, link is dead. |
| User binds a stale signed URL forever | Sliding TTL — refetch `/pets/species` on app start; client always uses the freshest URL. |

### 8.5 What's still client‑trusted (and that's fine)

Pet **position** is purely cosmetic. There's no reason to authenticate `x, y` against the server — let the client run the simulation. We only sync **ownership** and **active selection**. That keeps the WebSocket out of the hot path and the server stateless w.r.t. animation.

If you ever add multiplayer ("see other people's pets walking on your screen") then it's worth introducing a `pet_position` WebSocket event handled by the existing [`handle_ws_event`](../fastapi-server/app/routes/ws.py#L34-L39) match dispatch — but even then, treat positions as best‑effort gossip, not authoritative state.

---

## 9. Migrations + rollout plan

### Phase 1 — Stop the bleeding (½ day)

Apply the patch in §3. Production cat moves. No schema, no backend, no breaking changes.

### Phase 2 — Backend foundation (1–2 days)

1. Add Alembic migration: `pet_species`, `pet_instances`, `lootboxes`, `lootbox_opens`.
2. Seed two species (`cat`, `pug`) and one lootbox (`basic`, 50 pts) via a data migration.
3. Implement `app/routes/pets.py` (`/pets/species`, `/pets/inventory`, `/pets/{id}/active`).
4. Implement `app/routes/lootboxes.py` (`GET /lootboxes`, `POST /lootboxes/{sku}/open`).
5. Implement `app/services/pet_assets.py` + `app/routes/pet_assets.py` with signed URLs.
6. Register routers in [main.py](../fastapi-server/app/main.py).
7. Grant every existing user one free `cat` instance in the data migration so nobody loses their current pet.

### Phase 3 — Frontend refactor (2 days)

1. New types in `models/pet.ts` (PetSpecies / PetInstance / RuntimePet split).
2. Behavior registry + port existing four behaviors as plugins.
3. `usePetSpecies`, `usePetInventory`, `useLootboxes` hooks.
4. Replace [index.tsx](../client/src/modules/pets/index.tsx) with the inventory‑driven version (§7.2).
5. Delete bundled [assets/cat/](../client/src/modules/pets/assets/cat/).
6. Switch [PetSprite](../client/src/modules/pets/components/PetSprite.tsx) + [animation.ts](../client/src/modules/pets/engine/animation.ts) to URL‑based sheets.

### Phase 4 — Lootbox UX (1 day)

1. `LootboxStore` and `LootboxRevealModal` components.
2. Surface it from wherever the points display lives.
3. Add a "My Pets" drawer using `usePetInventory` with active/inactive toggles.

### Phase 5 — Content tooling (ongoing)

Adding a new pet is now: drop 4 PNGs in `fastapi-server/pet_assets/<species_id>/`, insert one row into `pet_species`, optionally update a `lootbox.drop_table`. No client deploy required.

---

## 10. Implementation checklist

**Bug fixes (Phase 1)**
- [ ] [PetEngine.ts:34](../client/src/modules/pets/engine/PetEngine.ts#L34) — remove the `if (this.pets.length < 1) return` early bail.
- [ ] [PetEngine.ts:17‑19](../client/src/modules/pets/engine/PetEngine.ts#L17-L19) — `addPet` de‑dupes by id.
- [ ] [usePetEngine.ts:5‑9](../client/src/modules/pets/hooks/usePetEngine.ts#L5-L9) — make the engine a module‑level singleton, drop the in‑render `setEngine`.
- [ ] [behaviors.ts:18](../client/src/modules/pets/engine/behaviors.ts#L18) — delete `console.log`.
- [ ] [behaviors.ts:12](../client/src/modules/pets/engine/behaviors.ts#L12) — decrement `behaviorTimer` by `deltaTime`, not `1`.
- [ ] [animation.ts:73](../client/src/modules/pets/engine/animation.ts#L73) — only reassign `backgroundImage` on behavior transitions.

**Backend (Phases 2 + 4)**
- [ ] Alembic migration for `pet_species`, `pet_instances`, `lootboxes`, `lootbox_opens`.
- [ ] `app/models/pet_*.py`, `app/models/lootbox*.py`.
- [ ] `app/crud/pets.py`, `app/crud/lootboxes.py`.
- [ ] `app/services/lootbox_roll.py` (CSPRNG + pity).
- [ ] `app/services/pet_assets.py` (HMAC signing).
- [ ] `app/routes/pets.py`, `app/routes/lootboxes.py`, `app/routes/pet_assets.py`.
- [ ] Add `pet_asset_secret` + `pet_assets_dir` fields to the `Env` class in [app/config.py](../fastapi-server/app/config.py) (read from `PET_ASSET_SECRET` / `PET_ASSETS_DIR` in `.env`; access as lowercase `env.pet_asset_secret`).
- [ ] Register routers in [main.py](../fastapi-server/app/main.py#L4).
- [ ] Data migration: seed two species + one lootbox + grant free `cat` to existing users.
- [ ] Idempotency‑Key cache for `/lootboxes/{sku}/open`.

**Frontend (Phase 3)**
- [ ] Split Pet → PetSpecies / PetInstance / RuntimePet in [models/pet.ts](../client/src/modules/pets/models/pet.ts).
- [ ] `engine/behaviorRegistry.ts` and per‑behavior plugin files.
- [ ] `engine/factory.ts` — `toRuntimePet(instance, species)`.
- [ ] `PetEngine.syncPets()` replaces ad‑hoc `addPet`/`removePet` callsites.
- [ ] Hooks: `usePetSpecies`, `usePetInventory`, `useLootboxes`.
- [ ] New `LootboxStore` and `LootboxRevealModal` components.
- [ ] Update [PetSprite](../client/src/modules/pets/components/PetSprite.tsx) + [animation.ts](../client/src/modules/pets/engine/animation.ts) to consume `species.spriteSheets`.
- [ ] Delete [assets/cat/](../client/src/modules/pets/assets/cat/) and bundled `metadata.ts`.
- [ ] Refetch `/pets/species` on focus / after every lootbox open so signed URLs stay fresh.

**Security (Phase 2)**
- [ ] Confirm `fastapi-server/pet_assets/` is gitignored, not bundled into the client, and not on a public path.
- [ ] Unit test: forge a signed URL with `uid=other_user` → expect 403.
- [ ] Unit test: tamper `exp` in the query string → 403.
- [ ] Unit test: legit URL after `ASSET_TTL` → 403.
- [ ] Unit test: open lootbox with insufficient points → no debit, 400.
- [ ] Unit test: two concurrent opens with same Idempotency‑Key → single grant, single debit.
- [ ] Manual: drop a `../../etc/passwd` style path in `species_id` → 400.

---

### Appendix A — Example second species

```python
# inside the data migration, after creating the cat:
PetSpecies(
    species_id="shadow_fox",
    display_name="Shadow Fox",
    rarity="epic",
    width=64, height=64,
    default_speed_x100=40,
    config={
        "behaviorBag": ["idle", "wander", "follow_cursor", "sleep", "wander", "wander"],
        "behaviorWeights": {"sleep": 0.5},
        "animations": {
            "idle":           {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 4},
            "wander":         {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 8},
            "follow_cursor":  {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 10},
            "sleep":          {"frameWidth": 64, "frameHeight": 64, "frames": 4, "fps": 2},
        },
    },
    enabled=True,
)
```

Drop `idle.png`, `wander.png`, `follow_cursor.png`, `sleep.png` into `fastapi-server/pet_assets/shadow_fox/`. No client changes.

### Appendix B — Why we kept positions client‑side

The pet is a **decoration**, not a game object. Server‑authoritative positions would 30× the WebSocket traffic, force the server into a game loop, and not actually prevent any cheat that matters (the only "cheat" is "make a pet you don't own appear on your own screen", which is purely cosmetic and the server already ignores it). If pets ever become *interactable* (combat, trading, viewable by other users), promote position to a server‑synced state machine — until then, keep it free.
