# Pet System — TODO / Finish-the-Implementation Guide

This is the build sheet for getting the pet system from "half-wired and not
compiling" to "you can buy a lootbox, get a goofy pet, and watch it strut around
your screen." It audits the **actual code on the `feature/pets` branch**, lists
every bug and gap with `file:line` pointers, and then gives you copy-paste code:
behaviors, the asset pipeline, **database migrations**, and a roster of new
**funny pets + lootboxes** (with sprites already generated — see §8/§9).

Architecture & rationale live in [pet.md](./pet.md). Operator recipes live in
[pets-usage.md](./pets-usage.md). The "make pets feel alive" layer (feed / pet /
poop) lives in [pet-interaction.md](./pet-interaction.md). **This file is the
punch-list to actually ship it.**

> Scope rule I followed while writing this: the only non-doc files added to the
> repo are the **sprite PNGs** (`fastapi-server/pet_assets/**`) and the **sprite
> generator** ([tools/sprite_forge/ascii_to_sprites.py](../tools/sprite_forge/ascii_to_sprites.py)).
> Every source-code change is written here as a diff/snippet for you to apply —
> nothing in `client/src` or `fastapi-server/app` was edited.

---

## Table of contents

1. [Current state at a glance](#1-current-state-at-a-glance)
2. [Confirmed bugs (with file:line)](#2-confirmed-bugs-with-fileline)
3. [Phase 0 — make it compile & not crash](#3-phase-0--make-it-compile--not-crash)
4. [Phase 1 — finish the engine (behaviors + animation + physics)](#4-phase-1--finish-the-engine-behaviors--animation--physics)
5. [Phase 2 — content pipeline + asset serving](#5-phase-2--content-pipeline--asset-serving)
6. [Phase 3 — lootbox & inventory UI](#6-phase-3--lootbox--inventory-ui)
7. [Phase 4 — the interaction layer (feed / pet / poop)](#7-phase-4--the-interaction-layer-feed--pet--poop)
8. [My pets & lootboxes (the fun part)](#8-my-pets--lootboxes-the-fun-part)
9. [The sprite forge (ascii → png)](#9-the-sprite-forge-ascii--png)
10. [Behaviors — full plugin library (code)](#10-behaviors--full-plugin-library-code)
11. [Database migrations — full code](#11-database-migrations--full-code)
12. [Definition of done / checklist](#12-definition-of-done--checklist)
13. [Duplicate API requests — points commit + species/inventory fan-out](#13-duplicate-api-requests--points-commit--speciesinventory-fan-out)

---

## 1. Current state at a glance

The refactor in [pet.md §4–§7](./pet.md#4-refactor-contentdriven-extensible-pet-system)
was **started but not finished**. The new content-driven types/hooks/engine
shell exist, but the engine internals were left pointing at the *old* `Pet`
model, no behaviors were ever written, and the backend has no seed data and
crashes on the one path that matters (open a box).

| Area | File | Status |
|---|---|---|
| Types (RunTimePet/PetSpecies/PetInstance) | [models/pet.ts](../client/src/modules/pets/models/pet.ts) | ✅ refactored |
| Engine loop + `syncPets` | [engine/PetEngine.ts](../client/src/modules/pets/engine/PetEngine.ts) | ✅ good |
| Behavior FSM driver + `pickWeighted` | [engine/behavior/index.ts](../client/src/modules/pets/engine/behavior/index.ts) | ⚠️ 1 timer bug |
| Behavior registry | [engine/behavior/behaviorRegistry.ts](../client/src/modules/pets/engine/behavior/behaviorRegistry.ts) | ✅ but **never populated** |
| **Behavior implementations** (idle/wander/…) | — | ❌ **none exist** |
| Animation stepper | [engine/animation.ts](../client/src/modules/pets/engine/animation.ts) | ❌ old `Pet` type, cat-only |
| Physics | [engine/physics.ts](../client/src/modules/pets/engine/physics.ts) | ❌ old `Pet` type (`pet.width`) |
| Collisions | [engine/collisions.ts](../client/src/modules/pets/engine/collisions.ts) | ❌ old `Pet` type (`pet.width`) |
| Sprite component | [components/PetSprite.tsx](../client/src/modules/pets/components/PetSprite.tsx) | ❌ old `Pet` type, cat-only |
| Factory | [engine/factory.ts](../client/src/modules/pets/engine/factory.ts) | ✅ good |
| Hooks (species/inventory/lootboxes/pets/engine) | [hooks/](../client/src/modules/pets/hooks/) | ⚠️ mostly good; `useLootboxes` missing creds |
| **Lootbox store / reveal / inventory UI** | — | ❌ **none exist** |
| Catalog/inventory/active routes | [routes/pets.py](../fastapi-server/app/routes/pets.py) | ⚠️ `owned` always false |
| Lootbox open route | [routes/lootboxes.py](../fastapi-server/app/routes/lootboxes.py) | ❌ **crashes** (`server_seed_hash`) |
| Asset signer + serve route | [utils/pet_assets.py](../fastapi-server/app/utils/pet_assets.py), [routes/pet_assets.py](../fastapi-server/app/routes/pet_assets.py) | ❌ route **not registered** |
| Roll RNG | [utils/lootbox_roll.py](../fastapi-server/app/utils/lootbox_roll.py) | ⚠️ no pity, returns bytes |
| Tables migration | [migrations/…c0ccf708df74](../fastapi-server/app/migrations/versions/c0ccf708df74_pet_and_lootbox_tables.py) | ✅ tables created |
| **Seed data** (species + lootboxes) | — | ❌ **none** → `/pets/species` is empty |
| **Server sprite assets** | `fastapi-server/pet_assets/` | ✅ **generated by this PR** (§9) |
| Interaction layer (feed/pet/poop) | — | ❌ not started |

**Net:** the client does not type-check (dead `Pet` import), no behaviors are
registered (pets wouldn't move even if it compiled), opening a box 500s, and even
if it didn't there'd be nothing to roll. Phases 0–2 below are the critical path.

---

## 2. Confirmed bugs (with file:line)

### Client (blocks `tsc` / `vite build`)

1. **Dead type import — `animation.ts`.** [animation.ts:2](../client/src/modules/pets/engine/animation.ts#L2)
   imports `{ BehaviorTypes, Pet }` from `models/pet`, but those types were
   deleted in the refactor. Also it renders the **bundled cat** for every pet via
   `petAssets[pet.currentBehavior]` ([animation.ts:73](../client/src/modules/pets/engine/animation.ts#L73))
   instead of `pet.species.spriteSheets`. → Phase 1.
2. **Old model in `physics.ts`.** [physics.ts:1,17,28](../client/src/modules/pets/engine/physics.ts#L1)
   types `Pet` and reads `pet.width` / `pet.height`. On `RunTimePet` those are
   `pet.species.width` / `.height`, so this is both a compile error and a runtime
   `NaN`. → Phase 1.
3. **Old model in `collisions.ts`.** [collisions.ts:1,19,60](../client/src/modules/pets/engine/collisions.ts#L1)
   — same `Pet` / `a.width` problem. → Phase 1.
4. **Old model in `PetSprite.tsx`.** [PetSprite.tsx:1,6,22,25](../client/src/modules/pets/components/PetSprite.tsx#L1)
   types `Pet`, sizes the div with `pet.width`, and hardcodes the cat sheet. → Phase 1.
5. **No behaviors registered, anywhere.** `registerBehavior` is defined
   ([behaviorRegistry.ts:14](../client/src/modules/pets/engine/behavior/behaviorRegistry.ts#L14))
   but **called by zero files** — there is no `engine/behaviors/` folder. So
   `getBehavior(id)` always returns `undefined`, `updateBehavior` sets no
   velocity, and pets stand still forever. → Phase 1 / §10.
6. **Behavior-timer formula bug.** [behavior/index.ts:18](../client/src/modules/pets/engine/behavior/index.ts#L18)
   uses `maxDurationMs` as the *base* of the random window:
   `(next?.maxDurationMs ?? 4000) + rand*(max - min)`. With 4000–7000 it yields
   7000–10000ms, not 4000–7000ms. Should base on `minDurationMs`. → Phase 1.
7. **`useLootboxes.open` drops the session cookie.** [useLootboxes.ts:31-37](../client/src/modules/pets/hooks/useLootboxes.ts#L31-L37)
   POSTs without `credentials: 'include'`, so the box-open request is
   unauthenticated → 401. (The GET right above it *does* include creds.) → Phase 3.
8. **Type drift in `models/pet.ts`.** `LootboxSummary.name`/`price` are typed
   `string` ([models/pet.ts:58-63](../client/src/modules/pets/models/pet.ts#L58-L63))
   but the server returns `displayName` + integer `price`. `SpeciesEntry.previewUrl`
   comment says "only when owned" — it's the opposite. → Phase 3.

### Server

9. **Lootbox open crashes — unknown column.** [routes/lootboxes.py:63](../fastapi-server/app/routes/lootboxes.py#L63)
   constructs `LootboxOpen(..., server_seed_hash=seed_hash)`, but the model
   ([models/lootbox_open.py](../fastapi-server/app/models/lootbox_open.py)) has
   **no `server_seed_hash` column** → `TypeError` on every open. Compounded:
   `roll()` returns `hashlib.sha256(seed).digest()` (raw **bytes**), not a hex
   string ([lootbox_roll.py:11](../fastapi-server/app/utils/lootbox_roll.py#L11)). → Phase 0.
10. **`owned` is always false.** [routes/pets.py:17](../fastapi-server/app/routes/pets.py#L17)
    builds `owned_species_ids = {i.id for i in owned_species}` — that's the
    instance **integer PK**, then compares it against `s.species_id` (a string).
    Never matches, so nobody ever gets signed sprite URLs; everyone sees the
    silhouette. Should be `{i.species_id for i in owned_species}`. → Phase 0.
11. **Asset route never registered.** [main.py:4-19](../fastapi-server/app/main.py#L4-L19)
    includes `pets` and `lootboxes` but **not** `pet_assets`. So
    `/pet-assets/{species}/{behavior}.png` is a 404 and no sprite ever loads. → Phase 0.
12. **Broken transaction atomicity on open.** [routes/lootboxes.py:43-65](../fastapi-server/app/routes/lootboxes.py#L43-L65)
    does `with db.begin_nested(): … db.commit()` — committing *inside* a SAVEPOINT —
    and `create_instance` ([crud/pets.py:12](../fastapi-server/app/crud/pets.py#L12))
    **commits internally too**. So the "debit + grant + audit in one transaction"
    guarantee from [pet.md §6.2](./pet.md#62-route--approutslootboxespy) doesn't
    hold; a mid-flight failure can debit points without granting a pet. → Phase 0.
13. **`instanceId` returned is the int PK.** [routes/lootboxes.py:75](../fastapi-server/app/routes/lootboxes.py#L75)
    returns `"instanceId": instance.id` (int), but everywhere else `instanceId`
    is the uuid string `instance.instance_id`. The reveal modal + later
    `/pets/{instance_id}/active` calls will use the wrong id. → Phase 0.
14. **Silhouette path is wrong + unserved.** [routes/pets.py:41](../fastapi-server/app/routes/pets.py#L41)
    returns `previewUrl = "/pets/assets/_silhouettes/{id}.png"`, but the asset
    router prefix is `/pet-assets` and there is **no route** serving silhouettes
    (and they should be **public**, not signed). → Phase 2.
15. **Signed URLs are host-relative.** `sign_sprite_url` returns `/pet-assets/…`
    ([utils/pet_assets.py:20](../fastapi-server/app/utils/pet_assets.py#L20)) with
    no origin. The client talks to FastAPI cross-origin via `serverUrl`
    ([utils/env.ts](../client/src/utils/env.ts)), so the client must prefix
    `serverUrl` when it renders. → Phase 1 (animation) / Phase 2.
16. **`roll()` has no pity and can `KeyError`.** [lootbox_roll.py](../fastapi-server/app/utils/lootbox_roll.py)
    dropped the `pityAfterOpens`/`pityFloor` logic from the doc, and indexes
    `speciesByRarity[rarity]` without a guard. Keep `rarities` keys ⊆
    `speciesByRarity` keys (the seed in §11 does) and/or restore pity. → Phase 2.
17. **Missing env docs / dir.** [config.py](../fastapi-server/app/config.py) requires
    `pet_assets_secret` and `pet_assets_dir`, but [sample.env](../fastapi-server/sample.env)
    documents neither, and `pet_assets/` didn't exist on the server until this PR. → Phase 2.

### Engine (surfaced by the completeness audit)

18. **First-frame `deltaTime` spike — `PetEngine.start()`.** [PetEngine.ts:33-43](../client/src/modules/pets/engine/PetEngine.ts#L33-L43)
    never resets `this.lastTime` before the first `requestAnimationFrame`. The
    engine is a **module-level singleton created at import** ([usePetEngine.ts:4](../client/src/modules/pets/hooks/usePetEngine.ts#L4)),
    so `lastTime` is stamped at page load; by the time `start()` runs and the
    first frame fires, `deltaTime = now − pageLoad` is **seconds**. That one giant
    `dt` instantly drains `behaviorTimer` (skips straight to a random behavior) and
    makes physics lurch. The §3 minimal patch in [pet.md](./pet.md#3-minimal-patch-to-make-the-current-pet-move-on-prod)
    sets `this.lastTime = performance.now()` right before the rAF — the current
    code dropped that line. → Phase 1 (§1.7).

---

## 3. Phase 0 — make it compile & not crash

Goal: app builds, server boots, opening a box succeeds end-to-end. Smallest set
of edits that unblocks everything.

### 0.1 Register the asset router — `app/main.py`

```python
from app.routes import blackjack, messages, points, themes, users, ws
from app.routes import leaderboard, pets, lootboxes, pet_assets   # + pet_assets
...
app.include_router(pets.router)
app.include_router(lootboxes.router)
app.include_router(pet_assets.router)                              # + this line
```

### 0.2 Fix the `owned` check — `app/routes/pets.py`

```python
# was: owned_species_ids = {i.id for i in owned_species}
owned_species_ids = {i.species_id for i in owned_species}
```

### 0.3 Make `roll()` return a hex string — `app/utils/lootbox_roll.py`

```python
seed = secrets.token_bytes(32)
seed_hash = hashlib.sha256(seed).hexdigest()   # str, not .digest() bytes
```

(Add the optional pity logic from [pet.md §6.1](./pet.md#61-roll-algorithm) here
too; not required for Phase 0.)

### 0.4 Add the audit column — `app/models/lootbox_open.py`

```python
server_seed_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
```

…and a one-line Alembic migration (§11.0). Until that migration runs, the open
route will fail — so either add the column **or** drop `server_seed_hash=` from
the `LootboxOpen(...)` call in 0.5. The column is the better choice (audit trail).

### 0.5 Fix the open transaction — `app/routes/lootboxes.py` + `app/crud/pets.py`

Make instance-creation **not** self-commit so the whole open is one transaction,
and return the uuid:

```python
# crud/pets.py  — flush (assigns PK) but don't commit; let the caller own the txn
def create_instance(db: Session, user_id: int, species_id: str, source: str) -> Pet_Instance:
    instance = Pet_Instance(user_id=user_id, species_id=species_id, source=source)
    db.add(instance)
    db.flush()        # was db.commit(); db.refresh(instance)
    return instance
```

```python
# routes/lootboxes.py
@router.post("/{sku}/open")
def open_box(sku: str, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    box = get_lootbox(db, sku)
    if not box:
        raise HTTPException(404, "Lootbox not found")

    try:
        pts = get_points_by_user_id(db, session.user_id)
        if pts.points < box.price:
            raise HTTPException(400, "not enough points")

        remaining = pts.points - box.price
        update_user_points(db, session.user_id, remaining)          # no commit inside

        rarity, species_id, seed_hash = roll(db, session.user_id, box)
        instance = create_instance(db, session.user_id, species_id, source=f"lootbox:{sku}")

        db.add(LootboxOpen(
            user_id=session.user_id, sku=sku,
            rolled_rarity=rarity, rolled_species=species_id,
            pet_instance_id=instance.id, cost=box.price,
            server_seed_hash=seed_hash,
        ))
        db.commit()
        db.refresh(instance)
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not open lootbox")

    return {
        "ok": True,
        "rolled": {
            "rarity": rarity,
            "speciesId": species_id,
            "instanceId": instance.instance_id,                     # uuid, not .id
            "spriteSheets": sign_sprite_urls_for_species(db, session.user_id, species_id),
        },
        "pointsRemaining": remaining,
    }
```

> Confirm `update_user_points` does **not** internally commit; if it does, give it
> the same flush-not-commit treatment, or the rollback won't protect the debit.

After Phase 0 + the seed migration (§11), `POST /lootboxes/starter_crate/open`
should debit points, create an instance, and return signed sprite URLs.

---

## 4. Phase 1 — finish the engine (behaviors + animation + physics)

### 1.1 Extend `RunTimePet` with render-only state — `models/pet.ts`

The animation stepper needs a scratch slot; pickup/interactions (Phase 4) need a
couple flags. Add to `RunTimePet`:

```ts
export interface RunTimePet {
    // …existing…
    _animationState?: { frame: number; timer: number; behavior: string; lastUrl?: string }
    _lockedBehavior?: boolean   // set by pushBehavior (Phase 4)
    _heldByUser?: boolean       // set by pickup (Phase 4)
}
```

### 1.2 Write the behaviors — **this is the missing core** (full code in §10)

Create `client/src/modules/pets/engine/behaviors/` with one file per behavior and
an `index.ts` barrel that imports them all so they self-register:

```
engine/behaviors/
  idle.ts  wander.ts  follow_cursor.ts  sleep.ts
  dance.ts  recoil.ts  teleport.ts  spin.ts  flee_cursor.ts  jitter.ts  hop.ts
  index.ts          // imports every file above
```

Then import the barrel **once** at engine init so registration runs before the
first frame. Add to the top of [engine/PetEngine.ts](../client/src/modules/pets/engine/PetEngine.ts):

```ts
import './behaviors'   // side-effect import: registers all behaviors
```

> Naming note: the existing folder is `engine/behavior/` (singular) and holds the
> FSM driver + registry. The behavior *plugins* go in `engine/behaviors/` (plural)
> per [pets-usage.md](./pets-usage.md#where-things-live). Keep both, or rename the
> driver folder — just pick one and update imports. Code in §10 assumes the
> registry is importable from `../behavior/behaviorRegistry`.

### 1.3 Fix the timer formula — `engine/behavior/index.ts`

```ts
const min = next?.minDurationMs ?? 4000
const max = next?.maxDurationMs ?? 7000
pet.behaviorTimer = min + Math.random() * (max - min)
```

Also respect the interaction lock (Phase 4): skip re-choosing while
`pet._lockedBehavior` is set and the timer hasn't expired.

### 1.4 Rewrite `animation.ts` to be species-driven

```ts
import type { RunTimePet } from '../models/pet'
import { serverUrl } from '../../../utils/env'

export function updateAnimation(pet: RunTimePet, deltaTime: number) {
    const anim = pet.species.animations[pet.currentBehavior]
        ?? pet.species.animations['idle']
    if (!anim) return

    if (!pet._animationState) pet._animationState = { frame: 0, timer: 0, behavior: '' }
    const st = pet._animationState

    if (st.behavior !== pet.currentBehavior) {   // reset on behavior change
        st.behavior = pet.currentBehavior
        st.frame = 0
        st.timer = 0
    }

    st.timer += deltaTime
    const frameDuration = 1000 / anim.fps
    if (st.timer >= frameDuration) {
        st.timer = 0
        st.frame = (st.frame + 1) % anim.frames
    }

    if (!pet.element) return
    pet.element.style.backgroundPosition = `-${st.frame * anim.frameWidth}px 0px`

    const url = pet.species.spriteSheets[pet.currentBehavior]
        ?? pet.species.spriteSheets['idle']
    if (url && st.lastUrl !== url) {                  // only touch the DOM on change
        pet.element.style.backgroundImage = `url(${serverUrl}${url})`
        st.lastUrl = url
    }
}
```

Delete the hardcoded `animations` map and the `import { petAssets }` /
`import { BehaviorTypes, Pet }` lines. The frame geometry now comes from the
species manifest (`/pets/species`), which is fed by the seed migration in §11.

### 1.5 Fix `physics.ts` and `collisions.ts` to use `pet.species.*`

`physics.ts`: change the type to `RunTimePet` and replace `pet.width`/`pet.height`
with `pet.species.width`/`pet.species.height`. Also skip integration while held
(Phase 4):

```ts
import type { RunTimePet } from '../models/pet'

export function updatePhysics(pet: RunTimePet) {
    if (pet._heldByUser) return        // pickup owns the position
    const { width, height } = pet.species
    pet.vx += (pet.targetVx - pet.vx) * 0.08
    pet.vy += (pet.targetVy - pet.vy) * 0.08
    pet.x += pet.vx
    pet.y += pet.vy
    if (pet.x < 0) { pet.x = 0; pet.targetVx *= -1 }
    if (pet.x > window.innerWidth - width)  { pet.x = window.innerWidth - width;  pet.targetVx *= -1 }
    if (pet.y < 0) { pet.y = 0; pet.targetVy *= -1 }
    if (pet.y > window.innerHeight - height){ pet.y = window.innerHeight - height; pet.targetVy *= -1 }
    if (Math.abs(pet.vx) > 0.1) pet.direction = pet.vx > 0 ? 1 : -1
}
```

`collisions.ts`: same swap — type `RunTimePet`, read `a.species.width` etc. in
`resolvePetCollision` and `resolveScreenBounds`.

> Tidy-up (optional, noted in [pet.md §2](./pet.md#other-live-problems-worth-fixing-in-the-same-pass)):
> the engine runs **both** `updatePhysics` (which bounces on `targetVx`) and
> `resolveScreenBounds` (which bounces on `vx`). Pick one bounce owner to avoid
> double-handling at the edges. I'd keep the bounce in `resolveScreenBounds` and
> drop the bound checks from `updatePhysics`.

### 1.6 Fix `PetSprite.tsx`

```tsx
import type { RunTimePet } from '../models/pet'
import { useEffect, useRef } from 'react'
import { usePetEngine } from '../hooks/usePetEngine'

export function PetSprite({ pet }: { pet: RunTimePet }) {
    const ref = useRef<HTMLDivElement>(null)
    const engine = usePetEngine()

    useEffect(() => {
        if (ref.current) engine.setPetElement(pet, ref.current)
    }, [pet, engine])

    return (
        <div
            ref={ref}
            className="absolute select-none pointer-events-auto"   // auto → clickable for Phase 4
            style={{
                width: pet.species.width,
                height: pet.species.height,
                imageRendering: 'pixelated',
                backgroundRepeat: 'no-repeat',
                willChange: 'transform',
            }}
        />
    )
}
```

The background image is now written by `updateAnimation`, so the component no
longer imports `petAssets`. (The bundled `assets/cat/*` PNGs can stay for now but
are unused once the server serves `cat/*` — see §8.)

### 1.7 Engine niceties

- **Reset `lastTime` on start (bug #18).** Stamp the clock right before the first
  frame so the opening `deltaTime` is ~16ms, not seconds:
  ```ts
  start() {
      if (this.running) return
      this.running = true
      this.lastTime = performance.now()   // ← add this; without it the first dt is huge
      const loop = (time: number) => { /* …unchanged… */ }
      requestAnimationFrame(loop)
  }
  ```
- `pushBehavior(pet, id, ms)` for interactions ([pet-interaction.md §5.2](./pet-interaction.md#52-client-dispatcher)) — add when you start Phase 4.
- Debounced `resize` handler so pets re-clamp into the viewport instead of reading `window.inner*` every frame.

---

## 5. Phase 2 — content pipeline + asset serving

### 2.1 Env + assets dir

`fastapi-server/.env` (and document in `sample.env`):

```
DATABASE_URL=...
PET_ASSETS_SECRET=<long-random-string>     # HMAC key for signed sprite URLs
PET_ASSETS_DIR=pet_assets                   # relative to fastapi-server/ working dir
```

The sprite tree already exists at `fastapi-server/pet_assets/` (§9). Make sure the
server's working directory resolves `PET_ASSETS_DIR` there (it's `os.path.abspath`'d
in [routes/pet_assets.py:16](../fastapi-server/app/routes/pet_assets.py#L16)).

### 2.2 Serve silhouettes publicly + fix the preview path

Silhouettes are public previews of unowned pets — no signing, no ownership check.
Add a small public route (or a `StaticFiles` mount) and fix the URL the catalog
hands out.

```python
# routes/pet_assets.py — add below serve_sprite
@router.get("/_silhouettes/{species_id}.png")
def serve_silhouette(species_id: str):
    abs_path = os.path.abspath(os.path.join(ASSETS_DIR, "_silhouettes", f"{species_id}.png"))
    if not abs_path.startswith(ASSETS_DIR + os.sep) or not os.path.isfile(abs_path):
        raise HTTPException(404)
    return FileResponse(abs_path, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})
```

```python
# routes/pets.py — previewUrl must match the real prefix
entry["previewUrl"] = f"/pet-assets/_silhouettes/{s.species_id}.png"
```

On the client, prefix `serverUrl` wherever `previewUrl`/`spriteSheets` is rendered
(the §1.4 animation code already does this for sprites).

### 2.3 Seed the catalog (DB migration)

`/pets/species` returns `[]` and lootbox rolls have nothing to pick until you seed
`pet_species` and `lootboxes`. The **full seed migration is in §11.1 / §11.2** and
covers the cat plus the new roster in §8.

After: `alembic upgrade head`, then hit `GET /pets/species` — you should see 11
species, all `owned: false` with a `previewUrl`.

### 2.4 CI guards (recommended)

Wire the content-integrity tests from
[pets-usage.md §8](./pets-usage.md#operational-tests-to-keep-in-ci): every
`speciesByRarity` id exists in `pet_species`; every `behaviorBag` id has an
`animations` entry; every animation has a sprite file on disk; every referenced
rarity has a non-zero weight. These catch ~90% of content typos before prod.

---

## 6. Phase 3 — lootbox & inventory UI

Nothing currently mounts a store or an inventory toggle, so there's no way to
**spend points**, **see what you own**, or **activate a pet**. Build three pieces
(designs in [pet.md §7](./pet.md#7-frontend-inventory-store-opening-flow)):

1. **`components/LootboxStore.tsx`** — grid of boxes, click → open → reveal modal.
   Reuses [`useModal`](../client/src/components/modal/ModalContext.tsx) +
   [`usePointsContext`](../client/src/modules/points/contexts/PointsContext.tsx),
   mirrors [`ThemeShop`](../client/src/modules/themes/index.tsx). Full code in
   [pet.md §7.3](./pet.md#73-lootbox-ui).
2. **`components/LootboxRevealModal.tsx`** — a **CS:GO-style spinner** reveal: a
   reel of decoy pets scrolls past a centre marker and eases to a stop on your
   actual drop, then flashes the rarity colour. Full implementation in **§6.1**.
   (This supersedes the simpler single-item reveal sketched in
   [pet.md §7.3](./pet.md#73-lootbox-ui).)
3. **`components/PetInventory.tsx`** — lists owned pets with a per-pet toggle that
   calls `setActive(instanceId, !active)`. Active pets are the ones `index.tsx`
   materialises onto the screen. **Full code + the mount point in §6.2.**

How the store/inventory get mounted and reachable is in **§6.2** — without it the
whole feature has no entry point.

**Also apply in Phase 3:**

- `useLootboxes.open`: add `credentials: 'include'` (bug #7).
- `models/pet.ts`: `LootboxSummary` → `{ sku: string; displayName: string; price: number; odds: Record<Rarity, number> }`; `LootboxOpenResult.pointsRemaining: number`. Update the store to read `box.displayName`/`box.price`.

### 6.1 The CS:GO-style spinner reveal

```
            ▼ marker
  ┌────┬────┬────┬────┬────┬────┐
  │duck│gun │cat │ 👻 │mug │rock│   ◀ reel eases left, lands centered → ✦ EPIC ✦
  └────┴────┴────┴────┴────┴────┘
           [ Add to party ]  [ Close ]
```

**Why this is safe:** the roll is already server-authoritative — `/lootboxes/{sku}/open`
returns the exact `rolled.speciesId` **before** any animation plays
([pet.md §6](./pet.md#6-lootboxes-serverauthoritative-rolls)). The spinner is
**pure theatre**: we build a reel of decoy tiles, drop the real winner at a fixed
index near the end, and animate the strip to land on it. The player can't change
the outcome by closing early — the pet is already granted.

**Inputs.** Pass the catalog (`usePetSpecies().species`) into the modal so the reel
has other pets to show as decoys; the **winner** tile uses the signed
`spriteSheets` from the open result. All image URLs are host-relative → prefix
`serverUrl` (bug #15). The `LootboxStore.handleOpen` from
[pet.md §7.3](./pet.md#73-lootbox-ui) becomes:

```tsx
const result = await open(sku)
await fetchPoints()
onOpened?.()
openModal(<LootboxRevealModal result={result} species={species} />)
```

**`client/src/modules/pets/components/LootboxRevealModal.tsx`:**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { serverUrl } from '../../../utils/env'
import { useModal } from '../../../components/modal/ModalContext'
import { usePetInventory } from '../hooks/usePetInventory'
import { RARITY_COLOR } from './rarity'
import type { LootboxOpenResult, SpeciesEntry } from '../models/pet'

const TILE = 96           // px per reel tile (incl. gap)
const VISIBLE = 5         // tiles visible in the window  → window width = 480px
const REEL_LEN = 48       // total tiles on the strip
const WINNER_AT = REEL_LEN - 5   // land near the end so it scrolls a long way
const SPIN_MS = 5200

// frame-0 thumbnail for a species: its idle sheet if owned, else the silhouette
function thumb(s?: SpeciesEntry): string | undefined {
    if (!s) return undefined
    const sheet = s.spriteSheets?.idle ?? (s.spriteSheets && Object.values(s.spriteSheets)[0])
    return sheet ? `${serverUrl}${sheet}` : (s.previewUrl ? `${serverUrl}${s.previewUrl}` : undefined)
}

export function LootboxRevealModal({
    result, species,
}: { result: LootboxOpenResult; species: SpeciesEntry[] }) {
    const { rarity, speciesId, instanceId, spriteSheets } = result.rolled
    const { closeModal } = useModal()
    const { setActive, refetch } = usePetInventory()
    const [done, setDone] = useState(false)
    const [added, setAdded] = useState(false)
    const stripRef = useRef<HTMLDivElement>(null)

    const winnerImg = `${serverUrl}${spriteSheets.idle ?? Object.values(spriteSheets)[0]}`
    const winnerName = species.find(s => s.speciesId === speciesId)?.displayName ?? speciesId

    // Build the reel once: random decoys, real winner pinned at WINNER_AT.
    const reel = useMemo(() => {
        const pool = species.length ? species : []
        const tiles = Array.from({ length: REEL_LEN }, (_, i) => {
            if (i === WINNER_AT) return { img: winnerImg, rarity, key: i }
            const s = pool.length ? pool[Math.floor(Math.random() * pool.length)] : undefined
            return { img: thumb(s), rarity: s?.rarity ?? 'common', key: i }
        })
        return tiles
    }, [species, winnerImg, rarity])

    // Animate: start at 0, then transition to the offset that centres WINNER_AT.
    useEffect(() => {
        const el = stripRef.current
        if (!el) return
        const jitter = (Math.random() - 0.5) * (TILE * 0.5)   // don't always dead-centre
        const offset = (WINNER_AT + 0.5) * TILE - (VISIBLE * TILE) / 2 + jitter
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        el.style.transform = 'translateX(0px)'
        el.style.transition = reduce ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(.12,.78,.2,1)`
        // next frame so the transition actually runs
        const raf = requestAnimationFrame(() => { el.style.transform = `translateX(-${offset}px)` })
        const t = setTimeout(() => setDone(true), reduce ? 0 : SPIN_MS)
        return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    }, [])

    const addToParty = async () => { await setActive(instanceId, true); await refetch(); setAdded(true) }

    return (
        <div className="flex flex-col items-center gap-4 p-6 rounded-xl [background:var(--bg)]"
             style={{ boxShadow: done ? `0 0 48px ${RARITY_COLOR[rarity]}` : undefined, transition: 'box-shadow .3s' }}>
            {/* reel window with a centre marker */}
            <div className="relative overflow-hidden border rounded-lg"
                 style={{ width: VISIBLE * TILE, height: TILE }}>
                <div className="absolute left-1/2 top-0 bottom-0 z-10 -translate-x-1/2"
                     style={{ width: 2, background: RARITY_COLOR[rarity] }} />
                <div ref={stripRef} className="flex h-full" style={{ willChange: 'transform' }}>
                    {reel.map(t => (
                        <div key={t.key} className="shrink-0 flex items-center justify-center"
                             style={{ width: TILE, height: TILE }}>
                            <div style={{
                                width: 64, height: 64, imageRendering: 'pixelated',
                                backgroundImage: t.img ? `url(${t.img})` : undefined,
                                backgroundPosition: '0 0', backgroundRepeat: 'no-repeat',
                                opacity: done ? 1 : 0.9,
                                filter: `drop-shadow(0 0 6px ${RARITY_COLOR[t.rarity as keyof typeof RARITY_COLOR] ?? '#555'})`,
                            }} />
                        </div>
                    ))}
                </div>
            </div>

            {done && (
                <>
                    <span className="uppercase tracking-widest font-bold" style={{ color: RARITY_COLOR[rarity] }}>{rarity}</span>
                    <span className="font-semibold">{winnerName}</span>
                    <div className="flex gap-2">
                        <button onClick={addToParty} disabled={added}
                                className="text-black bg-green-600 hover:bg-green-800 rounded-xl px-4 py-1">
                            {added ? 'Added!' : 'Add to party'}
                        </button>
                        <button onClick={closeModal} className="rounded-xl px-4 py-1 border">Close</button>
                    </div>
                </>
            )}
        </div>
    )
}
```

**Notes / knobs:**
- The reel shows **frame 0** of each pet (`backgroundPosition: 0 0`) — static thumbnails, so no per-tile animation loop is needed. Want the winner to *animate* after landing? Run the §1.4 frame-stepper on just the winner tile once `done` is true.
- Decoys reuse the catalog the store already fetched, so the modal makes **no
  extra network calls**. On a fresh account most decoys are silhouettes (mystery
  tiles) and the colourful winner pops — which is exactly the CS reveal feel.
- `WINNER_AT`, `SPIN_MS`, and the `cubic-bezier` are the feel knobs. The ease-out
  curve front-loads the speed and crawls to a stop. Add a tick sound per tile
  crossing the marker (reuse [`useSound`](../client/src/modules/sound/useSound.ts)) for full casino brainrot.
- Honours `prefers-reduced-motion`: skips straight to the result.
- **No pricing/odds logic here** — purely visual. The economy stays server-side.

### 6.2 Inventory panel + mounting the UI

The store and reveal are useless if there's no button to open them and no way to
toggle which pets are on screen. Two small pieces close that loop.

**`client/src/modules/pets/components/PetInventory.tsx`** — owned pets + a
Summon / On-screen toggle (drives the `active` flag `index.tsx` filters on):

```tsx
import { usePetInventory } from '../hooks/usePetInventory'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import type { Rarity } from '../models/pet'

export function PetInventory() {
    const { inventory, setActive, loading } = usePetInventory()
    const { species } = usePetSpecies()
    const meta = (id: string) => species.find(s => s.speciesId === id)

    if (loading && inventory.length === 0) return <p className="p-4 opacity-70">Loading…</p>
    if (inventory.length === 0) return <p className="p-4 opacity-70">No pets yet — open a lootbox!</p>

    return (
        <div className="flex flex-col gap-2 p-4 [background:var(--bg)] rounded-xl border w-full max-w-md">
            <h2 className="text-lg font-semibold text-center mb-1">Your pets ({inventory.length})</h2>
            {inventory.map(p => {
                const rarity: Rarity = meta(p.speciesId)?.rarity ?? 'common'
                return (
                    <div key={p.instanceId} className="flex items-center justify-between border rounded-lg px-3 py-2">
                        <span className="font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                            {p.nickname ?? meta(p.speciesId)?.displayName ?? p.speciesId}
                        </span>
                        <button
                            onClick={() => setActive(p.instanceId, !p.active)}
                            className={`rounded-lg px-3 py-1 text-sm text-black ${
                                p.active ? 'bg-green-600 hover:bg-green-800' : 'bg-gray-400 hover:bg-gray-500'
                            }`}
                        >
                            {p.active ? 'On screen' : 'Summon'}
                        </button>
                    </div>
                )
            })}
        </div>
    )
}
```

**`client/src/modules/pets/components/PetsMenu.tsx`** — a floating launcher that
opens the store + inventory in the existing modal system. **This is the entry
point the rest of Phase 3 was missing** — without it nothing is reachable:

```tsx
import { useModal } from '../../../components/modal/ModalContext'
import { LootboxStore } from './LootboxStore'
import { PetInventory } from './PetInventory'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { usePetInventory } from '../hooks/usePetInventory'

export function PetsMenu() {
    const { openModal } = useModal()
    const { refetch: refetchSpecies } = usePetSpecies()
    const { refetch: refetchInventory } = usePetInventory()

    const open = () => openModal(
        <div className="flex flex-col gap-4 items-center max-h-[80vh] overflow-auto">
            <LootboxStore onOpened={() => { refetchSpecies(); refetchInventory() }} />
            <PetInventory />
        </div>,
    )

    return (
        <button
            onClick={open}
            className="fixed bottom-4 right-4 z-[60] pointer-events-auto rounded-full px-4 py-2
                       border bg-green-600 hover:bg-green-800 text-black font-semibold"
        >
            🐾 Pets
        </button>
    )
}
```

Mount it once, next to the overlay, in [App.tsx](../client/src/App.tsx):

```tsx
<div className="relative overflow-hidden min-h-screen">
    <Pets />
    <PetsMenu />        {/* ← the launcher */}
    {/* …Typing… */}
</div>
```

> **Shared-state caveat.** `usePetSpecies`/`usePetInventory` each hold their own
> `useState` per call site, so `PetsMenu`'s `refetch` updates *its* copy, not the
> `PetInventory` rendered inside the modal (a separate instance). For the store,
> inventory, and on-screen pets to share one source of truth, lift these two hooks
> into a context provider exactly like
> [`PointsContext`](../client/src/modules/points/contexts/PointsContext.tsx) wraps
> `usePoints`. Until then `PetInventory` self-refreshes via its own
> `usePetInventory` + optimistic `setActive`, which is enough for a first cut.

---

## 7. Phase 4 — the interaction layer (feed / pet / poop)

This is the whole of [pet-interaction.md](./pet-interaction.md) and is **not
started**. It's optional for "pets exist and move," but it's where they become
*alive*. Treat it as its own project after Phases 0–3 are green. The DB migration
for it is in **§11.3**; the code is in pet-interaction.md. High-level punch-list:

- **Tables/models:** `pet_stats`, `pet_interaction_log`, `pet_poos`, `food_items`,
  `user_food_inventory` ([pet-interaction.md §4](./pet-interaction.md#4-database-additions)) → §11.3.
- **Server:** interaction handler registry + `POST /pets/{id}/interact` +
  `GET /pets/{id}/state` (mood, poos, cooldowns); handlers for
  `pet`/`play`/`feed`/`clean`/`call`; lazy stat decay; the poop scheduler.
- **Client:** interaction registry + dispatcher, pointer wiring on `PetSprite`,
  `pet`/`pickup`/`feed`/`clean`/`call`, particle FX, `<PooSprite>`, a vitals HUD,
  and the reaction behaviors (`happy_bounce`, `eating`, `disgust`, `tail_wag`,
  `held_wiggle`, `falling`, `landed`, `come_here`, `about_to_poo`).
- Reuse the seed migration pattern in §11 for `food_items`.

**Coverage check (completeness audit).** pet-interaction.md actually ships full
code for almost all of this — don't re-derive it: the dispatcher/registry (§5),
`pushBehavior` (§5.2), every handler (§6), the `/interact` + `/pets/{id}/state`
routes and stats CRUD (§5.5, §7.6), the poo service (§7.1–7.2), and the client UI
under its own names — `usePetState`, `<PooSprite>`, `<PetStateLayer>`, the food
shop, and **`PetVitals`** (that's the "vitals HUD"; there is no `VitalsHUD`). The
**one helper it references but never codes** is `spawnParticles` (used by
`pet`/`feed`/`clean`); it's only a checklist bullet. Minimal dependency-free stub
so those interactions don't import a missing module:

```ts
// client/src/modules/pets/fx/particles.ts
const GLYPH: Record<string, string> = {
    hearts: '❤️', sparkles: '✨', food_crumbs: '🍪', confetti: '🎉',
}
export function spawnParticles(
    { kind, x, y, count = 6 }: { kind: string; x: number; y: number; count?: number },
) {
    const glyph = GLYPH[kind] ?? '✨'
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div')
        el.textContent = glyph
        el.style.cssText =
            `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:60;` +
            `font-size:14px;will-change:transform,opacity;transition:transform .8s ease-out,opacity .8s`
        document.body.appendChild(el)
        requestAnimationFrame(() => {
            el.style.transform = `translate(${(Math.random() - 0.5) * 60}px, ${-30 - Math.random() * 40}px)`
            el.style.opacity = '0'
        })
        setTimeout(() => el.remove(), 850)
    }
}
```

> The 9 reaction behaviors (`happy_bounce`, `eating`, `disgust`, `tail_wag`,
> `held_wiggle`, `falling`, `landed`, `come_here`, `about_to_poo`) are plain
> behavior plugins (§10 pattern) — but each needs an `animations` entry + a sprite
> per species, or the engine silently falls back to `idle`. Either author those
> sheets (extend the forge in §9) or accept the `idle` fallback for species that
> lack them. This is content work, not code, and is the main "still to do" for a
> polished Phase 4.

---

## 8. My pets & lootboxes (the fun part)

A roster of deliberately stupid pets. Sprites are **already generated** into
`fastapi-server/pet_assets/<species_id>/` by the forge (§9); the seed SQL is in
§11. Each pet's `behaviorBag` references behaviors whose code is in §10.

### 8.1 The roster

| species_id | Name | Rarity | Speed | Behaviours | The bit |
|---|---|---|---|---|---|
| `cat` | Cat | common | 0.20 | idle, wander, follow_cursor, sleep | The OG. Now server-served so the gated pipeline has a baseline. |
| `stick_figure` | Stick Figure | common | 0.35 | idle, wander, **dance**, sleep | Breaks into a tilt-dance at random. Looks like your nephew drew it. |
| `pet_rock` | Pet Rock | common | 0.05 | idle, sleep | Does **nothing**. Lowest-maintenance pet. Occasionally sleeps (somehow more still). |
| `semicolon` | Sentient Semicolon | common | 0.30 | idle, wander, sleep | The `;` you forgot. Skitters around looking for a statement to terminate. |
| `rubber_duck` | Rubber Duck | uncommon | 0.25 | idle, wander, follow_cursor, sleep | Debugging companion. Follows your cursor like it's listening. |
| `coffee_mug` | Caffeine Mug | uncommon | 0.55 | idle, **jitter**, wander, sleep | Vibrates with caffeine. Fastest little guy. "sleep" is decaf crash. |
| `desk_gun` | Desk Gun | rare | 0.40 | idle, wander, **recoil**, sleep | The "pet gun." Randomly recoils backward like it fired. Harmless. Mostly. |
| `ghost_404` | 404 Ghost | rare | 0.30 | idle, wander, **teleport**, sleep | Pet Not Found. Blinks out and reappears elsewhere. |
| `bonk_hammer` | Bonk Hammer | epic | 0.30 | idle, **hop**, wander | Hops in little arcs. For when a pet needs to express *bonk*. |
| `disco_ball` | Disco Ball | epic | 0.20 | idle, **spin**, wander | Event pet. Spins forever. Brings the party; asks for nothing. |
| `loot_goblin` | Loot Goblin | legendary | 0.60 | idle, **flee_cursor**, wander, sleep | Runs **away** from your cursor. Drops nothing. Pure spite. |

### 8.2 The lootboxes

| sku | Name | Price | Contents | Notes |
|---|---|---|---|---|
| `starter_crate` | Starter Crate | 50 | common-heavy: cat / stick_figure / semicolon / pet_rock, + uncommon duck/mug, tiny rare desk_gun | ~1 typing run. Onboarding box. |
| `office_supplies` | Office Supplies Crate | 200 | semicolon, pet_rock, rubber_duck, coffee_mug, desk_gun, ghost_404 | The "haunted cubicle" box. |
| `cursed_cache` | Cursed Cache | 450 | ghost_404 (rare), bonk_hammer (epic), loot_goblin (legendary). Pity → epic after 25. | Premium. Chase the goblin. |
| `disco_fever` | Disco Fever (event) | 666 | disco_ball only (epic) | Ships `enabled=false`; flip to `true` during an event ([pets-usage.md §7](./pets-usage.md#7-limitedtime-and-event-pets)). |

All odds/contents are defined server-side in the seed migration (§11.2). Per
[pet.md §6.2](./pet.md#62-route--approutslootboxespy) only the per-rarity odds are
ever exposed to the client — never the species pool or pity rules.

---

## 9. The sprite forge (ascii → png)

[tools/sprite_forge/ascii_to_sprites.py](../tools/sprite_forge/ascii_to_sprites.py)
turns one tiny ASCII grid per pet into **animated** sprite sheets. No
dependencies — it hand-rolls the PNG encoder on top of stdlib `zlib`/`struct`, so
`python tools/sprite_forge/ascii_to_sprites.py` works anywhere.

**How it works:** you draw one 16×16 base grid in ASCII (palette chars → RGBA).
The tool rasterises it to a 64×64 frame, then for each behaviour it generates a
multi-frame horizontal strip by applying a per-frame transform — vertical bob,
leg-swap, forward lean, tilt, squash, fade, or a hop arc — chosen by the
behaviour's *style*. So `desk_gun/recoil.png` is the desk-gun base shoved
backward and eased forward over 4 frames; `bonk_hammer/hop.png` is a 6-frame jump
arc; `disco_ball/spin.png` is horizontal squash faking rotation.

```bash
python tools/sprite_forge/ascii_to_sprites.py            # build all (default: fastapi-server/pet_assets)
python tools/sprite_forge/ascii_to_sprites.py --list     # list species + behaviour styles
python tools/sprite_forge/ascii_to_sprites.py --only desk_gun
python tools/sprite_forge/ascii_to_sprites.py --out /tmp/sprites
```

Output (already committed in this PR):

```
fastapi-server/pet_assets/
  <species_id>/<behavior>.png      e.g. rubber_duck/wander.png  (384×64, 6 frames)
  _silhouettes/<species_id>.png    64×64 dark preview, one per species
```

**The frame counts/fps in the tool's `BEHAVIOR_ANIM` table are the source of
truth** and MUST match each species' `animations` JSON in §11. If you change a
behaviour's frame count, regenerate the sheet **and** update the migration.

### Adding a pet with the forge

1. Add an entry to `PETS` in the script: a `species_id`, its `behaviors` list,
   and a 16×16 `grid` (chars from `PALETTE`).
2. `python tools/sprite_forge/ascii_to_sprites.py --only <species_id>`.
3. Add the `pet_species` row (§11.1 shows the shape) with matching
   `behaviorBag` + `animations`.
4. Put it in a lootbox `drop_table` (§11.2). No client deploy needed.

To extend the *animation vocabulary*, add a `style` branch in `frame_offsets()`
and map a behaviour id to it in `BEHAVIOR_ANIM` — then write the matching engine
behaviour in §10 so the pet actually *moves* the way it *looks*.

---

## 10. Behaviors — full plugin library (code)

These are the **missing** behavior plugins (bug #5). One file each under
`client/src/modules/pets/engine/behaviors/`, all imported by `index.ts`. Each
sets `targetVx`/`targetVy` (and sometimes `targetX/Y` or `x/y` for teleport);
physics smooths the rest. `pet.species.defaultSpeed` is the per-species knob.

A shared cursor tracker (used by follow/flee):

```ts
// engine/behaviors/_cursor.ts
export const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
window.addEventListener('mousemove', e => { cursor.x = e.clientX; cursor.y = e.clientY })
```

**Core four** (referenced by almost every species):

```ts
// idle.ts
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'idle',
    minDurationMs: 2500, maxDurationMs: 5000,
    enter(pet) { pet.targetVx = 0; pet.targetVy = 0 },
    update() {},
})
```

```ts
// wander.ts
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'wander',
    minDurationMs: 3000, maxDurationMs: 8000,
    update(pet, dt) {
        if (Math.random() < 0.002 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s
            pet.targetVy = (Math.random() * 2 - 1) * s * 0.3
        }
    },
})
```

```ts
// follow_cursor.ts
import { registerBehavior } from '../behavior/behaviorRegistry'
import { cursor } from './_cursor'
registerBehavior({
    id: 'follow_cursor',
    minDurationMs: 6000, maxDurationMs: 12000,
    update(pet) {
        const dx = cursor.x - (pet.x + pet.species.width / 2)
        const dy = cursor.y - (pet.y + pet.species.height / 2)
        const d = Math.hypot(dx, dy)
        if (d < 40) { pet.targetVx = pet.targetVy = 0; return }
        const s = pet.species.defaultSpeed
        pet.targetVx = (dx / d) * s
        pet.targetVy = (dy / d) * s
    },
})
```

```ts
// sleep.ts
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'sleep',
    minDurationMs: 5000, maxDurationMs: 12000,
    enter(pet) { pet.targetVx = 0; pet.targetVy = 0 },
    update() {},
})
```

**The fun ones** (drive the §8 roster):

```ts
// dance.ts — stick figure: stays put, the sprite does the tilting
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'dance',
    minDurationMs: 2000, maxDurationMs: 4000,
    enter(pet) { pet.targetVx = 0; pet.targetVy = 0 },
    update() {},   // motion is purely in the dance.png frames
})
```

```ts
// jitter.ts — caffeine mug: rapid tiny darts
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'jitter',
    minDurationMs: 1500, maxDurationMs: 3500,
    update(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = (Math.random() * 2 - 1) * s * 1.5
        pet.targetVy = (Math.random() * 2 - 1) * s * 0.5
    },
})
```

```ts
// recoil.ts — desk gun: a sudden kick backward, then settle
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'recoil',
    minDurationMs: 700, maxDurationMs: 1400,
    enter(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = -pet.direction * s * 6   // shove opposite of facing
        pet.targetVy = 0
    },
    update(pet) { pet.targetVx *= 0.85 },       // decay the kick
    exit(pet) { pet.targetVx = 0 },
})
```

```ts
// hop.ts — bonk hammer: little ballistic hops
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'hop',
    minDurationMs: 2500, maxDurationMs: 5000,
    update(pet, dt) {
        if (Math.random() < 0.01 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s * 3
        }
    },
})
```

```ts
// spin.ts — disco ball: hovers gently, the spin is in the frames
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'spin',
    minDurationMs: 4000, maxDurationMs: 9000,
    update(pet, dt) {
        if (Math.random() < 0.003 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s * 0.4
        }
    },
})
```

```ts
// flee_cursor.ts — loot goblin: sprint AWAY from the pointer
import { registerBehavior } from '../behavior/behaviorRegistry'
import { cursor } from './_cursor'
registerBehavior({
    id: 'flee_cursor',
    minDurationMs: 3000, maxDurationMs: 7000,
    update(pet) {
        const dx = (pet.x + pet.species.width / 2) - cursor.x
        const dy = (pet.y + pet.species.height / 2) - cursor.y
        const d = Math.hypot(dx, dy) || 1
        const s = pet.species.defaultSpeed
        if (d > 350) { pet.targetVx = pet.targetVy = 0; return }  // safe → chill
        pet.targetVx = (dx / d) * s * 1.4
        pet.targetVy = (dy / d) * s * 0.6
    },
})
```

```ts
// teleport.ts — 404 ghost: blink to a new spot (set x/y directly; zero velocity)
import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'teleport',
    minDurationMs: 1500, maxDurationMs: 3000,
    enter(pet) {
        pet.targetVx = 0; pet.targetVy = 0; pet.vx = 0; pet.vy = 0
        pet.x = Math.random() * (window.innerWidth - pet.species.width)
        pet.y = Math.random() * (window.innerHeight - pet.species.height)
    },
    update() {},
})
```

```ts
// index.ts — barrel so all behaviors self-register on import
import './_cursor'
import './idle'; import './wander'; import './follow_cursor'; import './sleep'
import './dance'; import './jitter'; import './recoil'; import './hop'
import './spin'; import './flee_cursor'; import './teleport'
```

> Every id used in any `behaviorBag` (§11.1) must be registered here, and every id
> must have an `animations` entry + a sprite PNG, or the engine silently falls
> back to `idle` ([pets-usage.md §8](./pets-usage.md#pet-appears-but-doesnt-animate--is-just-a-static-frame)).
> The set above ⇄ the §8 roster ⇄ the §9 forte's `BEHAVIOR_ANIM` — keep all three in sync.

---

## 11. Database migrations — full code

All migrations follow the existing Alembic pattern under
[fastapi-server/app/migrations/versions/](../fastapi-server/app/migrations/versions/).
Generate the file with the repo's helper (`fastapi-server/scripts/migration.ps1`)
or `alembic revision -m "..."`, then paste the body. Set each `down_revision` to
the **current head** (`alembic heads`) — at time of writing that's
`c0ccf708df74` (the pet/lootbox tables migration), so the chain is:

```
c0ccf708df74  (tables)
   └─ 0.0  add server_seed_hash         (§11.0)
        └─ seed_pet_catalog              (§11.1 + §11.2, one file)
             └─ pet_interactions tables  (§11.3, when you do Phase 4)
```

> **Prefer raw SQL?** Ready-to-run PostgreSQL seed scripts equivalent to §11.1 +
> §11.2 live in [`fastapi-server/seeds/`](../fastapi-server/seeds/):
> [`seed_pet_species.sql`](../fastapi-server/seeds/seed_pet_species.sql) and
> [`seed_lootboxes.sql`](../fastapi-server/seeds/seed_lootboxes.sql). Run them after
> the tables exist (`alembic upgrade head`):
> ```bash
> psql "$DATABASE_URL" -f fastapi-server/seeds/seed_pet_species.sql
> psql "$DATABASE_URL" -f fastapi-server/seeds/seed_lootboxes.sql
> ```
> Both are idempotent (`ON CONFLICT … DO NOTHING`) and carry a commented rollback.
> Use these for a quick manual seed; use the Alembic version below when you want the
> seed tracked in the migration history. (The FastAPI backend is Postgres —
> `psycopg`/`JSONB`; the SQLite mentions elsewhere are the separate Node `server/`.)

### 11.0 Add the audit column (fixes bug #9)

```python
"""add server_seed_hash to lootbox_opens"""
from alembic import op
import sqlalchemy as sa

revision = "REPLACE_ME"
down_revision = "c0ccf708df74"

def upgrade():
    op.add_column("lootbox_opens", sa.Column("server_seed_hash", sa.String(length=64), nullable=True))

def downgrade():
    op.drop_column("lootbox_opens", "server_seed_hash")
```

### 11.1 Seed `pet_species` (the §8 roster)

> `default_speed_x100` is speed × 100 (int, dodges SQLite float drift).
> Every `behaviorBag` id has a matching `animations` entry, and every animation's
> `frames`/`fps` matches the forge's `BEHAVIOR_ANIM`. `behaviorBag` duplicates =
> higher weight (e.g. `wander` twice ⇒ twice as likely as `sleep`).

```python
"""seed pet catalog (species + lootboxes)"""
from alembic import op
import json

revision = "REPLACE_ME"
down_revision = "REPLACE_WITH_11_0"

# frame geometry shared by all 64x64 pets — keep in sync with the sprite forge
A = {
    "idle":          {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 4},
    "wander":        {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 7},
    "follow_cursor": {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 9},
    "sleep":         {"frameWidth": 64, "frameHeight": 64, "frames": 4, "fps": 2},
    "dance":         {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 10},
    "recoil":        {"frameWidth": 64, "frameHeight": 64, "frames": 4, "fps": 12},
    "teleport":      {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 10},
    "spin":          {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 12},
    "flee_cursor":   {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 12},
    "jitter":        {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 16},
    "hop":           {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 9},
}

def anims(*ids):
    return {i: A[i] for i in ids}

# (species_id, display_name, rarity, speed_x100, behaviorBag, behaviorWeights, anim_ids)
SPECIES = [
    ("cat",          "Cat",                "common",    20,
        ["idle", "wander", "wander", "follow_cursor", "sleep"], {},
        ("idle", "wander", "follow_cursor", "sleep")),
    ("stick_figure", "Stick Figure",       "common",    35,
        ["idle", "wander", "wander", "dance", "sleep"], {"sleep": 0.5},
        ("idle", "wander", "dance", "sleep")),
    ("pet_rock",     "Pet Rock",           "common",     5,
        ["idle", "idle", "idle", "sleep"], {},
        ("idle", "sleep")),
    ("semicolon",    "Sentient Semicolon", "common",    30,
        ["idle", "wander", "wander", "sleep"], {},
        ("idle", "wander", "sleep")),
    ("rubber_duck",  "Rubber Duck",        "uncommon",  25,
        ["idle", "wander", "follow_cursor", "sleep"], {},
        ("idle", "wander", "follow_cursor", "sleep")),
    ("coffee_mug",   "Caffeine Mug",       "uncommon",  55,
        ["idle", "jitter", "jitter", "wander", "sleep"], {"sleep": 0.4},
        ("idle", "jitter", "wander", "sleep")),
    ("desk_gun",     "Desk Gun",           "rare",      40,
        ["idle", "wander", "recoil", "sleep"], {"recoil": 0.6},
        ("idle", "wander", "recoil", "sleep")),
    ("ghost_404",    "404 Ghost",          "rare",      30,
        ["idle", "wander", "teleport", "sleep"], {"teleport": 0.7},
        ("idle", "wander", "teleport", "sleep")),
    ("bonk_hammer",  "Bonk Hammer",        "epic",      30,
        ["idle", "hop", "hop", "wander"], {},
        ("idle", "hop", "wander")),
    ("disco_ball",   "Disco Ball",         "epic",      20,
        ["idle", "spin", "spin", "wander"], {},
        ("idle", "spin", "wander")),
    ("loot_goblin",  "Loot Goblin",        "legendary", 60,
        ["idle", "flee_cursor", "flee_cursor", "wander", "sleep"], {},
        ("idle", "flee_cursor", "wander", "sleep")),
]

def upgrade():
    for sid, name, rarity, spd, bag, weights, anim_ids in SPECIES:
        config = {"behaviorBag": bag, "animations": anims(*anim_ids)}
        if weights:
            config["behaviorWeights"] = weights
        op.execute(
            "INSERT INTO pet_species "
            "(species_id, display_name, rarity, width, height, default_speed_x100, config, enabled) "
            "VALUES ("
            f"{_s(sid)}, {_s(name)}, {_s(rarity)}, 64, 64, {spd}, {_s(json.dumps(config))}, true)"
        )
    _seed_lootboxes()   # §11.2

def downgrade():
    ids = ", ".join(_s(s[0]) for s in SPECIES)
    op.execute(f"DELETE FROM pet_species WHERE species_id IN ({ids})")
    op.execute("DELETE FROM lootboxes WHERE sku IN "
               "('starter_crate','office_supplies','cursed_cache','disco_fever')")

def _s(v: str) -> str:
    """Single-quote + escape for inline SQL (values are all dev-authored, no user input)."""
    return "'" + str(v).replace("'", "''") + "'"
```

### 11.2 Seed `lootboxes` (the §8 boxes)

```python
# same migration file — called from upgrade()
BOXES = [
    ("starter_crate", "Starter Crate", 50, {
        "rarities": {"common": 80, "uncommon": 18, "rare": 2},
        "speciesByRarity": {
            "common":   ["cat", "stick_figure", "semicolon", "pet_rock"],
            "uncommon": ["rubber_duck", "coffee_mug"],
            "rare":     ["desk_gun"],
        },
    }, True),
    ("office_supplies", "Office Supplies Crate", 200, {
        "rarities": {"common": 40, "uncommon": 45, "rare": 15},
        "speciesByRarity": {
            "common":   ["semicolon", "pet_rock"],
            "uncommon": ["rubber_duck", "coffee_mug"],
            "rare":     ["desk_gun", "ghost_404"],
        },
    }, True),
    ("cursed_cache", "Cursed Cache", 450, {
        "rarities": {"rare": 50, "epic": 42, "legendary": 8},
        "speciesByRarity": {
            "rare":      ["ghost_404"],
            "epic":      ["bonk_hammer"],
            "legendary": ["loot_goblin"],
        },
        "pityAfterOpens": 25, "pityFloor": "epic",
    }, True),
    ("disco_fever", "Disco Fever", 666, {
        "rarities": {"epic": 100},
        "speciesByRarity": {"epic": ["disco_ball"]},
    }, False),   # event box: ships disabled, flip enabled=true during the event
]

def _seed_lootboxes():
    for sku, name, price, drop, enabled in BOXES:
        op.execute(
            "INSERT INTO lootboxes (sku, name, price, drop_table, enabled) "
            f"VALUES ({_s(sku)}, {_s(name)}, {price}, {_s(json.dumps(drop))}, {str(enabled).lower()})"
        )
```

> **Invariant the roll code relies on:** every key in `rarities` is also a key in
> `speciesByRarity` (else [lootbox_roll.py:28](../fastapi-server/app/utils/lootbox_roll.py#L28)
> can `KeyError`). All four boxes above satisfy it. `pityAfterOpens`/`pityFloor`
> on `cursed_cache` are inert until you restore pity in `roll()` (bug #16) — the
> stub from [pet.md §6.1](./pet.md#61-roll-algorithm) drops straight in.

### 11.3 Phase-4 interaction tables (when you build [pet-interaction.md](./pet-interaction.md))

Schema verbatim from [pet-interaction.md §4](./pet-interaction.md#4-database-additions).
One migration, five tables:

```python
"""pet interaction tables: stats, interaction log, poos, food, food inventory"""
from alembic import op
import sqlalchemy as sa

revision = "REPLACE_ME"
down_revision = "REPLACE_WITH_SEED"

def upgrade():
    op.create_table("pet_stats",
        sa.Column("pet_instance_id", sa.Integer,
                  sa.ForeignKey("pet_instances.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("hunger", sa.Float, nullable=False, server_default="80"),
        sa.Column("energy", sa.Float, nullable=False, server_default="80"),
        sa.Column("happiness", sa.Float, nullable=False, server_default="70"),
        sa.Column("cleanliness", sa.Float, nullable=False, server_default="90"),
        sa.Column("bond", sa.Float, nullable=False, server_default="0"),
        sa.Column("digestion_quality", sa.Float, nullable=False, server_default="3"),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("next_poo_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_interaction_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table("pet_interaction_log",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("pet_instance_id", sa.Integer,
                  sa.ForeignKey("pet_instances.id", ondelete="CASCADE"), index=True),
        sa.Column("user_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="CASCADE"), index=True),
        sa.Column("interaction_id", sa.String(32), nullable=False, index=True),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("delta", sa.JSON, nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), index=True),
    )
    op.create_table("pet_poos",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("pet_instance_id", sa.Integer,
                  sa.ForeignKey("pet_instances.id", ondelete="CASCADE"), index=True),
        sa.Column("user_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="CASCADE"), index=True),
        sa.Column("x", sa.Float, nullable=False),
        sa.Column("y", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("cleaned_at", sa.DateTime(timezone=True), nullable=True, index=True),
    )
    op.create_table("food_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("item_id", sa.String(32), unique=True, index=True),
        sa.Column("display_name", sa.String(64), nullable=False),
        sa.Column("price_points", sa.Integer, nullable=False),
        sa.Column("icon_key", sa.String(64), nullable=False),
        sa.Column("quality", sa.Integer, nullable=False, server_default="3"),
        sa.Column("effects", sa.JSON, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="1"),
    )
    op.create_table("user_food_inventory",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer,
                  sa.ForeignKey("users.id", ondelete="CASCADE"), index=True),
        sa.Column("item_id", sa.String(32), index=True),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "item_id", name="uq_user_food"),
    )

def downgrade():
    for t in ("user_food_inventory", "food_items", "pet_poos",
              "pet_interaction_log", "pet_stats"):
        op.drop_table(t)
```

Seed a few `food_items` in the same migration (drives the
[§3.5 economy](./pet-interaction.md#35-food-quality--the-happinesspoop-economy)):

```python
FOODS = [
    # item_id,      name,            price, icon,        quality, effects
    ("stale_bread", "Stale Bread",     5,  "bread",      1, {"hunger": 25}),
    ("kibble",      "Kibble",         15,  "kibble",     3, {"hunger": 35, "energy": 5}),
    ("sushi",       "Sushi Platter",  60,  "sushi",      5, {"hunger": 45, "energy": 15}),
    ("energy_drink","Energy Drink",   40,  "can",        2, {"energy": 40, "hunger": 5}),
]
# INSERT each as in §11.2 (effects -> json.dumps), enabled=true
```

---

## 12. Definition of done / checklist

**Phase 0 — compiles & opens a box (critical)**
- [ ] `main.py` includes `pet_assets.router` (#11)
- [ ] `routes/pets.py` `owned` uses `species_id` (#10)
- [ ] `lootbox_roll.roll()` returns `hexdigest()` str (#9)
- [ ] `LootboxOpen.server_seed_hash` column + migration §11.0 (#9)
- [ ] `create_instance` flushes (no commit); open route is one transaction (#12)
- [ ] open route returns `instance.instance_id` (#13)

**Phase 1 — engine moves the right sprites**
- [ ] `_animationState`/`_lockedBehavior`/`_heldByUser` on `RunTimePet` (§1.1)
- [ ] `engine/behaviors/*` + `index.ts`, imported by `PetEngine.ts` (#5, §10)
- [ ] behavior-timer formula fixed (#6)
- [ ] `PetEngine.start()` resets `lastTime` before first rAF (#18, §1.7)
- [ ] `animation.ts` species-driven + `serverUrl` prefix (#1, §1.4)
- [ ] `physics.ts` / `collisions.ts` use `pet.species.*` (#2, #3)
- [ ] `PetSprite.tsx` uses `RunTimePet` + `species.width/height` (#4)

**Phase 2 — content & assets**
- [ ] `PET_ASSETS_SECRET` + `PET_ASSETS_DIR` set; documented in `sample.env` (#17)
- [ ] public `_silhouettes` route + fixed `previewUrl` prefix (#14)
- [ ] seed migration §11.1 + §11.2 applied; `/pets/species` returns 11 (#-)
- [ ] (optional) restore pity in `roll()` (#16); CI content guards (§2.4)

**Phase 3 — UI to actually play**
- [ ] `LootboxStore` + `LootboxRevealModal` (CS-style spinner, §6.1) + `PetInventory` (§6.2)
- [ ] `PetsMenu` launcher mounted in `App.tsx` — the entry point (§6.2)
- [ ] `useLootboxes.open` sends `credentials: 'include'` (#7)
- [ ] `LootboxSummary`/`LootboxOpenResult` types match server (#8)

**Phase 4 — alive (optional, its own project)**
- [ ] interaction tables migration §11.3
- [ ] server interaction registry + `/interact` + `/state` + handlers
- [ ] client registry/dispatcher + pointer wiring + reactions + poos + vitals HUD

**Smoke test (Phases 0–3):** log in → open `starter_crate` → reveal modal shows a
pet animating → it appears in inventory → toggle active → it struts across the
screen using its species sprites → refresh: still owned, still active.

---

## 13. Duplicate API requests — points commit + species/inventory fan-out

Reported 2026-06-23: `POST /api/v2/points` returns `null` and the score is never
added; `GET /points` and `GET /pets/species` fire multiple times per page. Two
separate root causes — backend persistence bugs (points changes flushed but never
committed), and client-side request fan-out from hooks that fetch without a shared
context. **All the points issues — 13.1, 13.4, 13.5 — are now fixed. The
species/inventory fan-out (13.2–13.3) is left staged: those are pet-data requests,
not points.**

### 13.1 `POST /points` never persisted — ✅ FIXED in this change

- **Symptom:** `POST /api/v2/points` (e.g. `{"score":102,"category":"10",...}`)
  responds `null` and `user_points.points` is unchanged.
- **Cause:** [routes/points.py](../fastapi-server/app/routes/points.py) `update_points`
  called `update_user_points()` — which only `db.flush()`es, never commits
  ([crud/user_points.py:16-19](../fastapi-server/app/crud/user_points.py#L16-L19)) —
  and then returned with **no `db.commit()`**. `get_db` only `db.close()`s on
  teardown ([database.py:22-27](../fastapi-server/app/database.py#L22-L27)), and
  `close()` rolls back the open transaction → the flushed `UPDATE` is discarded.
  `check_session_token` *does* commit, but **before** the points update
  ([session_tokens.py:20-21](../fastapi-server/app/utils/session_tokens.py#L20-L21)),
  so it only persists the token delete, not the score. The empty `null` body is
  the same missing-return (the client ignores it and re-`GET`s anyway).
- **Why themes / blackjack-start looked fine:** they call a CRUD that commits
  immediately after the points update — `create_theme_by_user_id`
  ([user_themes.py:31](../fastapi-server/app/crud/user_themes.py#L31)),
  `create_game` ([blackjack.py:8](../fastapi-server/app/crud/blackjack.py#L8)) —
  which flushes the pending points `UPDATE` into a committed transaction. Lootbox
  open commits explicitly ([lootboxes.py:64](../fastapi-server/app/routes/lootboxes.py#L64)).
  The points route was the one mutator with no follow-up commit.
- **Fix applied** — commit in the route and return a real body:
  ```python
  # routes/points.py — update_points(), after computing newPoints
  newPoints: int = points.points + data.score * multiplier
  update_user_points(db, session.user_id, newPoints)
  db.commit()

  return {'ok': True, 'points': newPoints}
  ```
- **Convention note (don't "fix" it centrally):** `update_user_points` is
  flush-only **by design** — the caller owns the commit so multi-step routes stay
  atomic. Do **not** make it commit internally: lootbox open stages the debit and
  commits everything (debit + pet grant + audit row) together at the end; an
  internal commit would let a mid-roll failure debit points without granting a pet.
  (That rollback is already broken for a different reason — see 13.5.)

### 13.2 `GET /pets/species` fires N times — hook has no shared context

`usePetSpecies` ([hooks/usePetSpecies.ts](../client/src/modules/pets/hooks/usePetSpecies.ts))
fetches in its own `useEffect` **and** registers a `window 'focus'` refetch
([lines 37-41](../client/src/modules/pets/hooks/usePetSpecies.ts#L37-L41)), with
no shared cache. It is called independently in **four** components:

- [pets/index.tsx:10](../client/src/modules/pets/index.tsx#L10) — `Pets` (always mounted)
- [typing/index.tsx:65](../client/src/modules/typing/index.tsx#L65) — `Typing` (always mounted)
- [PetInventory.tsx:8](../client/src/modules/pets/components/PetInventory.tsx#L8) — PETS modal
- [LootboxStore.tsx:11](../client/src/modules/pets/components/LootboxStore.tsx#L11) — PETS modal

→ ≥2 `GET /pets/species` on first paint, plus one **per live consumer** on every
window focus.

**Fix:** give it a single shared instance via context, exactly like
[PointsContext](../client/src/modules/points/contexts/PointsContext.tsx) and
[PetInventoryContext](../client/src/modules/pets/contexts/PetInventoryContext.tsx).

```tsx
// client/src/modules/pets/contexts/PetSpeciesContext.tsx   (NEW)
import { createContext, useContext, type ReactNode } from "react"
import { usePetSpecies } from "../hooks/usePetSpecies"

const PetSpeciesContext = createContext<ReturnType<typeof usePetSpecies> | null>(null)

export function PetSpeciesProvider({ children }: { children: ReactNode }) {
    const species = usePetSpecies()
    return <PetSpeciesContext.Provider value={species}>{children}</PetSpeciesContext.Provider>
}

export function usePetSpeciesContext() {
    const ctx = useContext(PetSpeciesContext)
    if (!ctx) throw new Error("usePetSpeciesContext must be used within a PetSpeciesProvider")
    return ctx
}
```

```tsx
// App.tsx — mount the provider once (inside PetInventoryProvider)
<PetInventoryProvider>
    <PetSpeciesProvider>
        <ModalProvider>
            …
        </ModalProvider>
    </PetSpeciesProvider>
</PetInventoryProvider>
```

Then replace **all four** `usePetSpecies()` call sites with
`usePetSpeciesContext()` (drop the direct `usePetSpecies` import in each). The
`onOpened={() => { refetchSpecies(); refetchInventory() }}` in
[typing/index.tsx:392](../client/src/modules/typing/index.tsx#L392) now refetches
the single shared instance — which is the point.

### 13.3 Inventory `GET` fires twice — raw hook bypasses its context

Inventory is already shared via `PetInventoryProvider`
([App.tsx:19](../client/src/App.tsx#L19)), but
[typing/index.tsx:66](../client/src/modules/typing/index.tsx#L66) calls the **raw**
`usePetInventory()` instead of `usePetInventoryContext()`, spinning up a second
instance + a second fetch.

**Fix:** in `typing/index.tsx`, use `usePetInventoryContext()` (from
`../pets/contexts/PetInventoryContext`) and delete the direct `usePetInventory`
import at [line 26](../client/src/modules/typing/index.tsx#L26).

### 13.4 `GET /points` fires twice on test completion — redundant refetch — ✅ FIXED

In `handleChange` on completion ([typing/index.tsx](../client/src/modules/typing/index.tsx)):

```js
await updatePoints(score, category)   // already ends with `await fetchPoints()` (usePoints.tsx:81)
await fetchPoints()                   // ← redundant 2nd GET /points  (removed)
```

**Fixed:** dropped the trailing `await fetchPoints()`; `updatePoints` already
refreshes after the POST. *(Dev-only: React StrictMode double-invokes mount
effects, doubling first-load GETs in dev — not a prod issue, ignored.)*

### 13.5 Related backend commit bugs (same family) — ✅ FIXED

Same "caller forgot to commit / rollback" footgun as 13.1:

- **Blackjack points never persisted (worse than first thought).** *Both* points
  mutations were flush-only with no follow-up commit, so every blackjack points
  change rolled back on `db.close()`:
  - `start_game` debits the bet at [blackjack.py:52](../fastapi-server/app/routes/blackjack.py#L52),
    but the only commit before it is `create_game`'s — which runs **before** the
    debit ([blackjack.py:48](../fastapi-server/app/routes/blackjack.py#L48)).
  - `hit`/`stand` pays out the win/push at [blackjack.py:113](../fastapi-server/app/routes/blackjack.py#L113),
    after the hand-state commit at [blackjack.py:101](../fastapi-server/app/routes/blackjack.py#L101).

  Net effect: bet never left the balance and winnings never landed — a win, loss,
  and push all resolved back to the starting balance. **Fixed** with a `db.commit()`
  after each `update_user_points`. Both are required: if only the payout committed,
  it would read the un-debited balance and overpay by the bet.
- **Lootbox rollback was a no-op.** [lootboxes.py:69](../fastapi-server/app/routes/lootboxes.py#L69)
  was `db.rollback` — an attribute reference missing the `()`, so the
  `except Exception` branch never actually rolled back a failed open (only
  `get_db`'s `close()` was saving it). **Fixed:** `db.rollback()`.

### 13.6 Checklist

- [x] `routes/points.py` commits + returns body (13.1)
- [ ] `PetSpeciesContext` created, mounted in `App.tsx`, all 4 call sites swapped (13.2)
- [ ] `typing/index.tsx` uses `usePetInventoryContext()`, raw import removed (13.3)
- [x] redundant `fetchPoints()` removed from `handleChange` (13.4)
- [x] blackjack bet-debit + payout commits; lootbox `db.rollback()` parens (13.5)
