# Pet Interaction System — Design & Implementation

How to make pets feel **alive** — feed them, pick them up, pet them, watch them poo on your screen because that is, in fact, funny. Built on the architecture from [pet.md](./pet.md) and the content workflow from [pets-usage.md](./pets-usage.md).

This document covers the full design: the input layer (mouse/touch on a pet), the interaction layer (what the action does), the state layer (stats that persist), the reaction layer (how the pet responds in animation + behavior), and the extensibility model so a year from now you can add "give pet a hat" in under an hour.

---

## Table of contents

1. [Design philosophy: what "alive" means](#1-design-philosophy-what-alive-means)
2. [The four layers](#2-the-four-layers)
3. [Vital signs: the stats system](#3-vital-signs-the-stats-system)
   - [3.5 Food quality → the happiness/poop economy](#35-food-quality--the-happinesspoop-economy)
4. [Database additions](#4-database-additions)
5. [The interaction framework](#5-the-interaction-framework)
6. [Built‑in interactions in detail](#6-builtin-interactions-in-detail)
   - [6.1 Pet (the verb)](#61-pet-the-verb)
   - [6.2 Pick up & drop](#62-pick-up--drop)
   - [6.3 Feed](#63-feed)
   - [6.4 Clean (poo cleanup)](#64-clean-poo-cleanup)
   - [6.5 Talk / call](#65-talk--call)
7. [Pooping: the autonomous side](#7-pooping-the-autonomous-side)
   - [7.6 Serving + rendering poos (`/pets/{id}/state`)](#76-serving--rendering-poos--the-petsidstate-endpoint)
8. [Reaction behaviors (FSM extensions)](#8-reaction-behaviors-fsm-extensions)
9. [Food shop and inventory](#9-food-shop-and-inventory)
10. [Security, anti‑cheat, rate limits](#10-security-anticheat-rate-limits)
11. [UI: vitals, notifications, accessibility](#11-ui-vitals-notifications-accessibility)
12. [Extending the system](#12-extending-the-system)
13. [Testing](#13-testing)
14. [Rollout plan](#14-rollout-plan)
15. [Implementation checklist](#15-implementation-checklist)

---

## 1. Design philosophy: what "alive" means

"Alive" is a vibe, not a feature. Three things produce it:

1. **The pet has needs that decay even when you're not looking.** Coming back after lunch to a hungry, sad pet creates emotional investment that nothing else does. Tamagotchi figured this out in 1996.
2. **Every action you take has a visible reaction within ~150 ms.** Click → ear twitch. Drop food → run toward it. Pick up → little surprised wiggle. Latency kills the illusion.
3. **The pet does things you didn't ask for.** Wanders off, falls asleep mid‑screen, sneezes, and yes — poops. Autonomy is what separates a pet from a button.

The system is designed around those three: **persistent decaying stats**, **optimistic client reactions with server reconciliation**, and **autonomous events on a server clock**.

### Constraints

- **Don't punish the user for closing the tab.** Stats decay, but slowly, and only while logged in for at most N hours/day (see §3.3). You should not log in to a dead pet because you were in a meeting.
- **Don't make the pet annoying.** A "Pet is hungry!" notification once per hour is charming; once per minute is uninstall‑bait.
- **Don't gate gameplay behind pet care.** Pets are decoration with depth, not chores. A neglected pet stops doing tricks, but never blocks the typing module or any other feature.

---

## 2. The four layers

```
┌─────────────────────────────────────────────────────────────────┐
│ INPUT layer                                                     │
│   pointer events on the pet element                             │
│   (click, drag, drop-item-onto, right-click, long-press)        │
└─────────────────────────────────────────────────────────────────┘
                              │ produces an InteractionIntent
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ INTERACTION layer                                               │
│   InteractionRegistry: client-side definitions                  │
│   per-interaction: cooldown, item requirements, optimistic FX,  │
│                    server endpoint, reaction behavior to push   │
└─────────────────────────────────────────────────────────────────┘
                              │ POSTs to /pets/{instance_id}/interact
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STATE layer (server-authoritative)                              │
│   InteractionHandler (per id) validates + mutates stats         │
│   stats persist; decay is lazy on read                          │
└─────────────────────────────────────────────────────────────────┘
                              │ returns updated stats + cooldown
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ REACTION layer                                                  │
│   pushBehavior(pet, behaviorId, durationMs) into the FSM        │
│   one-shot particle effects, sound cues                         │
│   UI vitals re-render                                           │
└─────────────────────────────────────────────────────────────────┘
```

Each layer is independently extensible. A new interaction is **one client file + one server handler**, both auto‑registered. Sound familiar — it's the same pattern as the behavior registry in [pet.md §4.3](./pet.md#43-behavior-registry).

---

## 3. Vital signs: the stats system

### 3.1 The stats

| Stat | Range | Decays | Decay rate (default) | Reaches 0 means |
|---|---|---|---|---|
| `hunger` | 0–100, **100 = full** | Yes | −1.0 / hour | Pet refuses to play, becomes sad; eventually triggers `behavior:hungry_whine`. |
| `energy` | 0–100 | Yes | −0.8 / hour while awake, +5 / hour while sleeping | Pet falls asleep wherever it is; can't be played with. |
| `happiness` | 0–100 | Yes | −0.5 / hour | Pet refuses interactions, stays in `idle`/`sleep` more, sad sprite tint optional. |
| `cleanliness` | 0–100 | Yes | −0.3 / hour, −10 instantly per uncleaned poo on screen | Pet stops following cursor, becomes lethargic. |
| `bond` | 0–1000 | **No** | Earned through interactions, never decays | Unlocks new behaviors and emotes at thresholds (100, 250, 500, 1000). |

All stats are species‑agnostic by default. A species can override decay rates via `pet_species.config.statDecay` — e.g. a slime that gets hungry twice as fast. (Future hook; not required day one.)

### 3.2 Lazy decay (the only sensible way)

We never run a background job to decrement stats. Instead, the values stored in the DB are *snapshots*, and the *current* value is computed on read:

```python
def current_value(snapshot: float, snapshot_at: datetime, decay_per_hour: float) -> float:
    elapsed_hours = (now() - snapshot_at).total_seconds() / 3600
    return max(0.0, min(100.0, snapshot - decay_per_hour * elapsed_hours))
```

On any **write** (an interaction landed), you:
1. Compute the current value from the snapshot.
2. Apply the interaction's delta.
3. Save the new value and bump `snapshot_at` to `now()`.

This is O(1), stateless, scales to millions of pets, and is the standard pattern for any "resource regenerates over time" system. No cron, no Celery worker, no race conditions.

### 3.3 Offline grace

To honor the "don't punish for closing the tab" rule, cap effective decay time:

```python
MAX_DECAY_WINDOW = timedelta(hours=8)   # decay only counts up to 8h between sessions
elapsed = min(now() - snapshot_at, MAX_DECAY_WINDOW)
```

A user who leaves for the weekend comes back to a slightly hungry pet, not a comatose one. Tune `MAX_DECAY_WINDOW` based on what feels right — start at 8 hours.

### 3.4 Thresholds (mood)

Stats roll up into a derived **mood**:

| Mood | Trigger | Effect |
|---|---|---|
| `happy` | all stats ≥ 60 | Default; full behavior bag available. |
| `content` | all stats ≥ 30, mean ≥ 50 | Default; no behavior changes. |
| `tired` | `energy < 30` | `sleep` weight ×3, `wander` weight ×0.5. |
| `hungry` | `hunger < 30` | Pet drifts toward last food drop position; emits hungry whine emote every ~60s. |
| `sad` | `happiness < 30` | Removes `dance`, `emote_heart` from rotation. |
| `dirty` | `cleanliness < 30` | `wander` weight ×0.5; pet stops following cursor. |

Mood is computed on every `/pets/state` read; the client mutates behavior weights at render time, not in the engine. Keeps the engine itself dumb.

### 3.5 Food quality → the happiness/poop economy

This is the core loop the feeding + pooping systems create. **Every food has a `quality` from 1 (poor) to 5 (gourmet).** Quality is not the same as how *filling* a food is (`effects.hunger`): cheap food can fill the belly while making the pet miserable.

Quality drives two things at feed time:

| Quality | Label | Happiness on feed | Digestion (poop frequency) |
|---|---|---|---|
| 1 | Poor | **−8** | Gut is wrecked → poops ~3× as often |
| 2 | Cheap | **−3** | Poops noticeably more often |
| 3 | Standard | **+1** | Neutral baseline |
| 4 | Premium | **+5** | Poops a bit less often |
| 5 | Gourmet | **+10** | Clean gut → poops least often |

The chain that makes a neglected pet *feel* neglected:

```
feed cheap food  ──▶  happiness ↓ (instant)         ──▶ mood drifts to `sad`
                 └─▶  digestion_quality ↓ (rolling)  ──▶ poop interval shrinks
                                                      ──▶ more poos pile up on screen
                                                      ──▶ cleanliness ↓ (−10 per uncleaned poo)
                                                      ──▶ mood drifts to `dirty`
                                                      ──▶ player must clean (time sink) or buy better food (points sink)
```

So the player has a real economic decision every feed: **spend few points on junk** (fills hunger now, but you'll be mopping up poop and cheering up a sad pet), or **spend more points on quality** (keeps the pet happy and the screen clean). That tension is the whole game.

Two pieces of persistent state make this work, both on `pet_stats` (see §4):

- **`digestion_quality`** — a rolling average (EMA) of recent food quality, range 1–5, default 3.0. The poop scheduler reads it: low digestion → short interval → more poop. It decays *toward* whatever you've been feeding, so one gourmet meal won't instantly undo a week of scraps.
- **`next_poo_at`** — the scheduled time of the next poo. Junk food (`quality ≤ 2`) also yanks this forward for **instant** visible feedback ("you fed it garbage, here's a poop in 30 seconds").

Implementation lives in the feed handler (§6.3) and the poop scheduler (§7.1).

---

## 4. Database additions

Three new tables on top of the §5 schema from [pet.md](./pet.md#5-backend-pet-catalog-inventory-and-asset-gating).

### `pet_stats`

One row per pet instance. Created when the instance is created.

```python
# fastapi-server/app/models/pet_stats.py
from sqlalchemy import Integer, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class PetStats(Base):
    __tablename__ = "pet_stats"

    pet_instance_id: Mapped[int] = mapped_column(
        ForeignKey("pet_instances.id", ondelete="CASCADE"),
        primary_key=True
    )

    hunger:      Mapped[float] = mapped_column(Float, nullable=False, default=80.0)
    energy:      Mapped[float] = mapped_column(Float, nullable=False, default=80.0)
    happiness:   Mapped[float] = mapped_column(Float, nullable=False, default=70.0)
    cleanliness: Mapped[float] = mapped_column(Float, nullable=False, default=90.0)
    bond:        Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Rolling average of recent food quality (1=poor .. 5=gourmet), default "standard".
    # Drives poop frequency in schedule_next_poo (§7.1). Does NOT decay on its own —
    # it only moves when the pet is fed (§6.3).
    digestion_quality: Mapped[float] = mapped_column(Float, nullable=False, default=3.0)

    snapshot_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    next_poo_at: Mapped["DateTime | None"] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    last_interaction_at: Mapped["DateTime | None"] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

`bond` and `snapshot_at` share a row but `bond` is read raw (it never decays). `next_poo_at` is the scheduled time of the pet's next poo (see §7); `NULL` means "compute and schedule on next read."

### `pet_interaction_log`

Audit + cooldown source‑of‑truth. Append‑only.

```python
class PetInteractionLog(Base):
    __tablename__ = "pet_interaction_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pet_instance_id: Mapped[int] = mapped_column(
        ForeignKey("pet_instances.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    interaction_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    delta: Mapped[dict] = mapped_column(JSON, nullable=False)   # {hunger:+30, happiness:+5}
    occurred_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
```

`(pet_instance_id, interaction_id, occurred_at)` is the index we use for cooldown checks.

### `pet_poos`

Yes this is its own table. Each is an entity that lives on screen until cleaned.

```python
class PetPoo(Base):
    __tablename__ = "pet_poos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pet_instance_id: Mapped[int] = mapped_column(
        ForeignKey("pet_instances.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Position is purely cosmetic — same client-trust call as pet positions
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    cleaned_at: Mapped["DateTime | None"] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
```

Soft delete via `cleaned_at` so analytics on "poos cleaned per user" is one query. Hard delete via a periodic cleanup of rows where `cleaned_at < now - 30d`.

### `food_items`

Catalog of available food (server content, same pattern as `lootboxes`):

```python
class FoodItem(Base):
    __tablename__ = "food_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    item_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    price_points: Mapped[int] = mapped_column(Integer, nullable=False)
    icon_key: Mapped[str] = mapped_column(String(64), nullable=False)
    quality: Mapped[int] = mapped_column(Integer, nullable=False, default=3)  # 1=poor .. 5=gourmet
    effects: Mapped[dict] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(default=True)
```

- **`quality`** (1–5) drives happiness-on-feed and poop frequency per the economy in [§3.5](#35-food-quality--the-happinesspoop-economy). It is **server-owned** — the client never sends it.
- **`effects`** is the *nutritional* payload, applied on top of the quality-driven happiness. JSON with **plain numbers** (JSON has no leading `+`, so write `15` not `+15`; negatives like `-5` are fine): `{ "hunger": 30, "energy": 10 }`. `happiness` may appear here too and is *added to* the quality happiness; `bond` is ignored (bond is earned, never fed).

### `user_food_inventory`

How much of each food a user has:

```python
class UserFoodInventory(Base):
    __tablename__ = "user_food_inventory"
    __table_args__ = (UniqueConstraint("user_id", "item_id", name="uq_user_food"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[str] = mapped_column(String(32), index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

Yes you could merge food into one big "items" table for future expandability (toys, accessories). I'd start with food‑only and generalize when there's a second item category — premature generalization is how `inventory` tables end up with 14 unused columns. See §12 for the migration path.

---

## 5. The interaction framework

### 5.0 Shared helpers (new files)

The interaction code below imports two helpers that don't exist yet. They're thin and shared, so they live in `client/src/shared/`. Both honour this codebase's convention: talk to FastAPI via `import.meta.env.VITE_FASTAPI_API_URL` (exported as `serverUrl` from [`utils/env.ts`](../client/src/utils/env.ts)) with `credentials: 'include'` — **no `/api` proxy** (see [`usePoints`](../client/src/modules/points/hooks/usePoints.tsx)).

**`client/src/shared/api.ts`**:

```ts
import { serverUrl } from '../utils/env'

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetch(`${serverUrl}${path}`, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) {
        // FastAPI puts errors in `detail` (string or object)
        const detail = typeof data?.detail === 'string' ? data.detail : (data?.detail?.reason ?? `HTTP ${res.status}`)
        throw Object.assign(new Error(detail), { status: res.status, detail: data?.detail })
    }
    return data as T
}

export const api = {
    get:  <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body, headers),
    // mutating interactions (feed) pass an idempotency key — see §10.3
    idempotencyKey: () => crypto.randomUUID(),
}
```

**`client/src/shared/toast.ts`** — minimal, or wire to whatever toast/notification surface exists. The interaction code only needs `showToast(message)`:

```ts
export function showToast(message: string) {
    // Replace with the app's real notification system. Stub keeps the dispatcher honest.
    console.warn('[toast]', message)
}
```

### 5.1 Client: the registry

Mirrors the [behavior registry](./pet.md#43-behavior-registry).

**`client/src/modules/pets/interactions/registry.ts`**:

```ts
import type { RuntimePet } from '../models/pet'

export type InteractionTrigger =
    | 'click'              // single click on pet
    | 'long_press'         // click & hold > 500ms
    | 'right_click'        // context menu (e.g. "rename")
    | 'drop_item'          // dragged inventory item onto pet
    | 'pickup'             // mousedown → drag → mouseup (handled separately, fires a generic 'play')

export interface InteractionContext {
    pet: RuntimePet
    pointer: { x: number; y: number }
    payload?: Record<string, unknown>    // e.g. { itemId: 'kibble' }
}

export interface InteractionDef {
    id: string                            // "pet", "feed", "pick_up", "clean", "talk"
    trigger: InteractionTrigger
    cooldownMs?: number                   // client-side check (server enforces too)
    requires?: {
        item?: string                     // item_id from food_items
        minMood?: string
    }
    pre?: (ctx: InteractionContext) => boolean    // optional gate
    optimistic?: (ctx: InteractionContext) => void
    request: (ctx: InteractionContext) => Promise<InteractionResult>
    onResult?: (ctx: InteractionContext, r: InteractionResult) => void
    onError?: (ctx: InteractionContext, e: Error) => void
}

export interface InteractionResult {
    ok: true
    delta: Partial<Record<StatId, number>>
    newStats: Stats
    reaction?: { behaviorId: string; durationMs: number }
    cooldownUntilMs?: number              // server-stamped cooldown
}

const registry = new Map<string, InteractionDef>()
export const registerInteraction = (d: InteractionDef) => registry.set(d.id, d)
export const getInteraction = (id: string) => registry.get(id)
export const interactionsFor = (trigger: InteractionTrigger) =>
    [...registry.values()].filter(d => d.trigger === trigger)
```

One file per interaction in `client/src/modules/pets/interactions/`. Auto‑registered by importing `interactions/index.ts` once at app boot (same pattern as behaviors).

### 5.2 Client: dispatcher

The single entry point bound to pet pointer events.

**`client/src/modules/pets/interactions/dispatcher.ts`**:

```ts
import {
    interactionsFor,
    getInteraction,
    type InteractionContext,
    type InteractionDef,
    type InteractionTrigger,
} from './registry'
import { pushBehavior } from '../engine/behaviorRegistry'
import { showToast } from '../../../shared/toast'

const localCooldowns = new Map<string, number>()  // `${petId}:${id}` → expiresAt

export async function dispatch(
    trigger: InteractionTrigger,
    ctx: InteractionContext,
    explicitId?: string,
) {
    const candidates = explicitId
        ? [getInteraction(explicitId)].filter(Boolean) as InteractionDef[]
        : interactionsFor(trigger)

    for (const def of candidates) {
        if (def.pre && !def.pre(ctx)) continue
        const key = `${ctx.pet.instanceId}:${def.id}`
        if (def.cooldownMs && (localCooldowns.get(key) ?? 0) > performance.now()) continue

        def.optimistic?.(ctx)
        try {
            const r = await def.request(ctx)
            if (r.reaction) {
                pushBehavior(ctx.pet, r.reaction.behaviorId, r.reaction.durationMs)
            }
            if (r.cooldownUntilMs) {
                localCooldowns.set(key, performance.now() + r.cooldownUntilMs)
            }
            def.onResult?.(ctx, r)
        } catch (e) {
            def.onError?.(ctx, e as Error)
            showToast((e as Error).message)
        }
        return  // first matching interaction handles it; don't fan out
    }
}
```

`pushBehavior(pet, id, ms)` is a new engine method that **interrupts** the current behavior and locks the FSM to the given behavior for `ms` milliseconds. Implementation:

```ts
// engine/PetEngine.ts (or behaviorRegistry.ts)
export function pushBehavior(pet: RuntimePet, behaviorId: string, durationMs: number) {
    const old = getBehavior(pet.currentBehavior)
    old?.exit?.(pet)
    pet.currentBehavior = behaviorId
    const next = getBehavior(behaviorId)
    next?.enter?.(pet)
    pet.behaviorTimer = durationMs
    pet._lockedBehavior = true     // chooseBehavior() respects this until timer expires
}
```

The `_lockedBehavior` flag is cleared inside `chooseBehavior` when the timer hits zero.

### 5.3 Client: wiring pointer events

The pet container in [index.tsx:37](../client/src/modules/pets/index.tsx#L37) is `pointer-events-none`. Pets themselves need `pointer-events-auto` so clicks land on them but not on the empty overlay. Update [PetSprite.tsx:24‑28](../client/src/modules/pets/components/PetSprite.tsx#L24-L28):

```tsx
<div
    ref={ref}
    className="absolute select-none cursor-pointer pointer-events-auto"
    onClick={e => dispatch('click', { pet, pointer: { x: e.clientX, y: e.clientY } })}
    onContextMenu={e => { e.preventDefault(); dispatch('right_click', ...) }}
    onPointerDown={e => beginPickup(pet, e)}   // see §6.2
    onDragOver={e => e.preventDefault()}
    onDrop={e => {
        const itemId = e.dataTransfer.getData('application/x-pet-item')
        if (itemId) dispatch('drop_item', { pet, pointer: {...}, payload: { itemId } })
    }}
    style={{ ... }}
/>
```

Long press is implemented with a 500 ms `setTimeout` on `pointerdown`, cancelled by `pointerup`/`pointermove > 5px`.

### 5.4 Server: the handler registry

**`fastapi-server/app/services/interactions/registry.py`**:

```python
from dataclasses import dataclass
from typing import Callable, Any
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.models.pet_instances import PetInstance
from app.models.pet_stats import PetStats

@dataclass
class InteractionResult:
    delta: dict[str, float]
    new_stats: dict[str, float]
    reaction: dict | None = None       # {"behaviorId": "...", "durationMs": ...}
    cooldown_ms: int | None = None

HandlerFn = Callable[[Session, int, PetInstance, PetStats, dict | None], InteractionResult]

@dataclass
class Handler:
    id: str
    cooldown_ms: int
    requires_item: str | None = None
    fn: HandlerFn = None  # type: ignore

_handlers: dict[str, Handler] = {}

def register(h: Handler):
    _handlers[h.id] = h

def get(id: str) -> Handler | None:
    return _handlers.get(id)
```

One file per interaction in `fastapi-server/app/services/interactions/`:
- `pet_handler.py`
- `feed_handler.py`
- `pickup_handler.py`
- `clean_handler.py`
- `talk_handler.py`
- `__init__.py` imports each so they self‑register.

### 5.5 Server: the route

A **single endpoint** dispatches all interactions. Keeps the API surface small and the auth/cooldown logic in one place.

**`fastapi-server/app/routes/pet_interactions.py`**:

```python
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import get_instance_for_user
from app.crud.pet_stats import get_or_create_stats, apply_decay, write_stats
from app.crud.pet_interaction_log import last_occurrence, log_interaction
from app.services.interactions import registry as interactions

router = APIRouter(prefix="/pets", tags=["pets"])

class InteractBody(BaseModel):
    interaction_id: str
    payload: dict | None = None

@router.post("/{instance_id}/interact")
def interact(instance_id: str, body: InteractBody, request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    inst = get_instance_for_user(db, session.user_id, instance_id)
    if not inst:
        raise HTTPException(404, "Pet not found")

    handler = interactions.get(body.interaction_id)
    if not handler:
        raise HTTPException(400, f"Unknown interaction '{body.interaction_id}'")

    # Server-enforced cooldown
    last = last_occurrence(db, inst.id, handler.id)
    if last and (datetime.now(timezone.utc) - last) < timedelta(milliseconds=handler.cooldown_ms):
        remaining = handler.cooldown_ms - int((datetime.now(timezone.utc) - last).total_seconds() * 1000)
        raise HTTPException(429, detail={"reason": "cooldown", "retry_after_ms": remaining})

    # Snapshot → apply decay → load fresh values
    stats = get_or_create_stats(db, inst.id)
    apply_decay(stats)   # mutates in-place, doesn't commit

    result = handler.fn(db, session.user_id, inst, stats, body.payload)

    write_stats(db, stats)
    log_interaction(db, inst.id, session.user_id, handler.id, body.payload, result.delta)
    db.commit()

    return {
        "ok": True,
        "delta": result.delta,
        "stats": result.new_stats,
        "reaction": result.reaction,
        # Python has no ?? operator — fall back to the handler's default cooldown.
        "cooldownMs": result.cooldown_ms if result.cooldown_ms is not None else handler.cooldown_ms,
    }
```

Register in [main.py](../fastapi-server/app/main.py#L4):

```python
from app.routes import pet_interactions
app.include_router(pet_interactions.router)
```

That's the entire framework. Adding "give pet a hat" is one client file + one server file. Everything else — auth, cooldowns, audit, decay — happens for free.

---

## 6. Built‑in interactions in detail

### 6.1 Pet (the verb)

The simplest interaction. Click your pet → small happiness boost, gentle bond accrual, a "happy bounce" reaction.

**Server handler** (`fastapi-server/app/services/interactions/pet_handler.py`):

```python
from app.services.interactions.registry import register, Handler, InteractionResult

def handle_pet(db, user_id, inst, stats, payload):
    delta = {"happiness": +2.0, "bond": +1.0}
    stats.happiness = min(100.0, stats.happiness + delta["happiness"])
    stats.bond = min(1000.0, stats.bond + delta["bond"])
    return InteractionResult(
        delta=delta,
        new_stats=_snapshot(stats),
        reaction={"behaviorId": "happy_bounce", "durationMs": 1200},
    )

register(Handler(id="pet", cooldown_ms=2000, fn=handle_pet))
```

**Client interaction** (`client/src/modules/pets/interactions/pet.ts`):

```ts
import { registerInteraction } from './registry'
import { spawnParticles } from '../fx/particles'
import { api } from '../../../shared/api'

registerInteraction({
    id: 'pet',
    trigger: 'click',
    cooldownMs: 2000,
    optimistic({ pet, pointer }) {
        spawnParticles({ kind: 'hearts', x: pointer.x, y: pointer.y, count: 3 })
    },
    request: ({ pet }) =>
        api.post(`/pets/${pet.instanceId}/interact`, { interaction_id: 'pet' }),
})
```

Optimistic particles fire instantly; the reaction behavior (`happy_bounce`) is pushed once the server confirms. If the server rejects (cooldown), the particles still happened — that's fine, no state change.

### 6.2 Pick up & drop

Tactile, physical. While held, physics is suspended and the pet follows the cursor. On release: if dropped from > 200 px above the floor, the pet "falls" (gravity) and emits `behavior:landed` for 600 ms. If gently placed, no falling.

A successful pickup‑drop counts as `play` and contributes to happiness + bond. Heavy cooldown (10 s) to prevent spam.

**Client only — the input handling** (`client/src/modules/pets/interactions/pickup.ts`):

```ts
import { registerInteraction } from './registry'
import { api } from '../../../shared/api'

let held: { pet: RuntimePet; offsetX: number; offsetY: number; startedAt: number } | null = null

export function beginPickup(pet: RuntimePet, e: React.PointerEvent) {
    e.preventDefault()
    held = {
        pet,
        offsetX: e.clientX - pet.x,
        offsetY: e.clientY - pet.y,
        startedAt: performance.now(),
    }
    pet._heldByUser = true       // physics step respects this and skips integration
    pushBehavior(pet, 'held_wiggle', Number.POSITIVE_INFINITY)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
}

function onMove(e: PointerEvent) {
    if (!held) return
    held.pet.x = e.clientX - held.offsetX
    held.pet.y = e.clientY - held.offsetY
}

function onUp(e: PointerEvent) {
    if (!held) return
    window.removeEventListener('pointermove', onMove)
    const dropDistance = window.innerHeight - held.pet.y - held.pet.height
    held.pet._heldByUser = false
    held.pet.targetVy = 0
    held.pet.vy = 0
    pushBehavior(held.pet,
        dropDistance > 200 ? 'falling' : 'landed',
        dropDistance > 200 ? 1500 : 600)

    // Only count as "play" if held > 500ms and moved > 50px
    const movedEnough = Math.hypot(e.clientX - held.pet.x, e.clientY - held.pet.y) > 50
    const heldEnough = (performance.now() - held.startedAt) > 500
    if (movedEnough && heldEnough) {
        api.post(`/pets/${held.pet.instanceId}/interact`, { interaction_id: 'play' })
            .catch(() => { /* cooldown — fine, we ignore */ })
    }
    held = null
}

// Register the "play" interaction (the actual stat-changing part)
registerInteraction({
    id: 'play',
    trigger: 'pickup',
    cooldownMs: 10_000,
    request: ({ pet }) =>
        api.post(`/pets/${pet.instanceId}/interact`, { interaction_id: 'play' }),
})
```

**Physics integration**: in `engine/physics.ts`, gate the entire step:

```ts
export function updatePhysics(pet: RuntimePet) {
    if (pet._heldByUser) return     // skip; pickup handler owns position
    if (pet.currentBehavior === 'falling') {
        pet.vy += GRAVITY            // simple Y gravity for the fall
        pet.x += pet.vx
        pet.y += pet.vy
        if (pet.y + pet.height >= window.innerHeight) {
            pet.y = window.innerHeight - pet.height
            pet.vy = 0
            pushBehavior(pet, 'landed', 600)
        }
        return
    }
    // ...existing smoothed acceleration
}
```

`GRAVITY = 0.6` is a good starting point. Tune until it feels weighty.

**Server handler** (`fastapi-server/app/services/interactions/play_handler.py`):

```python
def handle_play(db, user_id, inst, stats, payload):
    delta = {"happiness": +8.0, "energy": -3.0, "bond": +3.0}
    stats.happiness = min(100.0, stats.happiness + delta["happiness"])
    stats.energy = max(0.0, stats.energy + delta["energy"])
    stats.bond = min(1000.0, stats.bond + delta["bond"])
    return InteractionResult(
        delta=delta,
        new_stats=_snapshot(stats),
        reaction={"behaviorId": "dizzy", "durationMs": 800},  # after being dropped
    )

register(Handler(id="play", cooldown_ms=10_000, fn=handle_play))
```

### 6.3 Feed

Two flows:
1. **Drag from inventory onto pet** — dispatches `trigger: 'drop_item'` with `payload: { itemId }`.
2. **Click pet → context menu → Feed → pick food** — dispatches the same interaction explicitly.

**Client** (`client/src/modules/pets/interactions/feed.ts`):

```ts
registerInteraction({
    id: 'feed',
    trigger: 'drop_item',
    cooldownMs: 3000,
    pre: ({ payload }) => !!payload?.itemId,
    optimistic({ pointer, payload }) {
        spawnParticles({ kind: 'food_crumbs', ...pointer, count: 6 })
    },
    request: ({ pet, payload }) =>
        api.post(`/pets/${pet.instanceId}/interact`, {
            interaction_id: 'feed',
            payload: { itemId: payload!.itemId },
        }),
    onResult({ payload }, _r) {
        // The reaction (`eating` or `disgust`) is auto-pushed by the dispatcher from
        // r.reaction. Tell the food UI a unit was consumed so the badge updates without
        // a refetch round-trip (see FoodInventory in §9.2).
        window.dispatchEvent(
            new CustomEvent('pet:fed', { detail: { itemId: payload!.itemId } }),
        )
    },
})
```

The drop is wired in [`PetSprite`](../client/src/modules/pets/components/PetSprite.tsx) (§5.3): `onDrop` reads `application/x-pet-item` and dispatches `'drop_item'` with `payload: { itemId }`. The `feed` interaction is the only one registered for that trigger, so it handles it.

**Server** (`fastapi-server/app/services/interactions/feed_handler.py`). This is the heart of the food-quality economy ([§3.5](#35-food-quality--the-happinesspoop-economy)):

```python
import random
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException

from app.crud.food import get_food, consume_one
from app.crud.pet_stats import snapshot as _snapshot   # serialize current stats → dict
from app.services.interactions.registry import register, Handler, InteractionResult

# Quality 1 (poor) .. 5 (gourmet) → instant happiness change on feed.
QUALITY_HAPPINESS = {1: -8.0, 2: -3.0, 3: 1.0, 4: 5.0, 5: 10.0}

# How fast recent food dominates the rolling digestion average. 0.4 → a single
# meal moves digestion_quality ~40% of the way toward that food's quality.
DIGESTION_EMA_ALPHA = 0.4

def handle_feed(db, user_id, inst, stats, payload):
    item_id = (payload or {}).get("itemId")
    if not item_id:
        raise HTTPException(400, "itemId required")

    food = get_food(db, item_id)
    if not food or not food.enabled:
        raise HTTPException(404, "Unknown food")

    # Inventory check + atomic decrement (race-free, see consume_one below).
    if not consume_one(db, user_id, item_id):
        raise HTTPException(400, "You don't have any of that")

    delta: dict[str, float] = {}

    # 1. Nutritional effects (hunger/energy/...). Skip bond + happiness — handled below.
    for stat, change in (food.effects or {}).items():
        if not hasattr(stats, stat) or stat in ("bond", "happiness"):
            continue
        current = getattr(stats, stat)
        new_val = max(0.0, min(100.0, current + float(change)))
        setattr(stats, stat, new_val)
        delta[stat] = round(new_val - current, 2)

    # 2. Happiness is QUALITY-driven, then nudged by any explicit effects.happiness.
    #    Cheap food (quality 1–2) is a NET NEGATIVE → an unhappy pet.
    happiness_change = QUALITY_HAPPINESS.get(food.quality, 0.0)
    happiness_change += float((food.effects or {}).get("happiness", 0.0))
    before = stats.happiness
    stats.happiness = max(0.0, min(100.0, stats.happiness + happiness_change))
    delta["happiness"] = round(stats.happiness - before, 2)

    # 3. Bond: a small fixed reward just for being cared for.
    stats.bond = min(1000.0, stats.bond + 2.0)
    delta["bond"] = 2.0

    # 4. Digestion: roll the quality EMA. Low values → schedule_next_poo fires sooner (§7.1).
    stats.digestion_quality = (
        (1 - DIGESTION_EMA_ALPHA) * stats.digestion_quality
        + DIGESTION_EMA_ALPHA * float(food.quality)
    )

    # 5. Junk food (quality <= 2) upsets the tummy NOW: pull the next poo forward so the
    #    consequence is visible within ~20–90s, not just statistically later.
    if food.quality <= 2:
        soon = datetime.now(timezone.utc) + timedelta(seconds=random.uniform(20, 90))
        if stats.next_poo_at is None or soon < stats.next_poo_at:
            stats.next_poo_at = soon

    # Quality also picks the reaction: a happy chomp vs. a disgusted gag.
    reaction_id = "eating" if food.quality >= 3 else "disgust"
    return InteractionResult(
        delta=delta,
        new_stats=_snapshot(stats),
        reaction={"behaviorId": reaction_id, "durationMs": 2500},
    )

register(Handler(id="feed", cooldown_ms=3000, requires_item="any_food", fn=handle_feed))
```

Notes:

- **The client never sends stat deltas.** It sends `itemId`; the server looks up the food's quality/effects and decides everything. A forged `payload.delta` is ignored ([§10.1](#101-the-threat-model)).
- **`disgust`** is a new reaction behavior (add it to the table in [§8](#8-reaction-behaviors-fsm-extensions)) — pet recoils, a little 🤢 particle. Falls back to `idle` if a species has no `disgust` sheet.
- `consume_one` lives in `crud/food.py` — the full module is in [§9.1](#91-server-crud-and-routes).

The atomic decrement that makes double-feed race-free:

```python
# crud/food.py (excerpt — full module in §9.1)
def consume_one(db, user_id: int, item_id: str) -> bool:
    """Atomic decrement. Returns False if the user has none."""
    rows = db.execute(
        update(UserFoodInventory)
            .where(
                UserFoodInventory.user_id == user_id,
                UserFoodInventory.item_id == item_id,
                UserFoodInventory.quantity > 0,
            )
            .values(quantity=UserFoodInventory.quantity - 1)
    ).rowcount
    db.commit()
    return rows > 0
```

Single-statement UPDATE with the `quantity > 0` guard makes this race-free without explicit locks. If the user clicks feed twice in 100 ms, only one decrement succeeds — the other returns `False` and the request 400s cleanly.

### 6.4 Clean (poo cleanup)

Triggered by clicking a poo (poos are their own DOM elements, not pets — they have their own `<PooSprite>` component). Removes the poo and gives a small `cleanliness` + bond boost. If the pet itself is dirty when cleaned, it gets a bath effect; if not, just confetti and a happy tail wag.

The `clean` interaction is on the **poo**, not the pet — but we route it through the same `/pets/{instance_id}/interact` endpoint with `payload: { pooId }` so cooldowns / audit unify.

**Client** (`client/src/modules/pets/interactions/clean.ts`):

```ts
registerInteraction({
    id: 'clean',
    trigger: 'click',           // attached to <PooSprite>
    cooldownMs: 500,            // generous — they're cleaning, let them go
    optimistic({ payload }) {
        spawnParticles({ kind: 'sparkles', ...(payload!.poo as { x: number; y: number }), count: 8 })
        // Remove the poo locally right away. `removeLocal` / `rollback` are supplied by
        // <PooSprite> via the dispatch payload (§7.6) — they map to the owning pet's
        // usePetState. Optimistic UI without a global poo store.
        ;(payload!.removeLocal as (() => void) | undefined)?.()
    },
    request: ({ pet, payload }) =>
        api.post(`/pets/${pet.instanceId}/interact`, {
            interaction_id: 'clean',
            payload: { pooId: payload!.pooId },   // only the id crosses the wire
        }),
    onError({ payload }) {
        // Server rejected (already cleaned / cooldown) — restore truth from the server.
        ;(payload!.rollback as (() => void) | undefined)?.()
    },
})
```

> Only `pooId` is sent to the server; `poo`, `removeLocal`, and `rollback` are client-only payload fields used for optimistic rendering and never serialized into the request body.

**Server handler** marks the poo cleaned and adjusts stats:

```python
def handle_clean(db, user_id, inst, stats, payload):
    poo_id = (payload or {}).get("pooId")
    poo = db.query(PetPoo).filter_by(id=poo_id, user_id=user_id, cleaned_at=None).first()
    if not poo:
        raise HTTPException(404, "Poo not found or already cleaned")

    poo.cleaned_at = datetime.now(timezone.utc)
    delta = {"cleanliness": +5.0, "bond": +0.5}
    stats.cleanliness = min(100.0, stats.cleanliness + delta["cleanliness"])
    stats.bond = min(1000.0, stats.bond + delta["bond"])
    return InteractionResult(
        delta=delta,
        new_stats=_snapshot(stats),
        reaction={"behaviorId": "tail_wag", "durationMs": 800},
    )

register(Handler(id="clean", cooldown_ms=500, fn=handle_clean))
```

### 6.5 Talk / call

Right‑click → context menu → "Call". Pet runs toward your cursor for ~3 s. No stat impact, just affordance. Useful when your pet has wandered to the edge of the screen.

```python
def handle_call(db, user_id, inst, stats, payload):
    return InteractionResult(
        delta={},
        new_stats=_snapshot(stats),
        reaction={"behaviorId": "come_here", "durationMs": 3000},
    )

register(Handler(id="call", cooldown_ms=5000, fn=handle_call))
```

The `come_here` behavior reads `payload.targetX/Y` (cursor position the user right‑clicked at) — handled inside the behavior using the same `pet.targetX/Y` fields that `follow` already uses.

---

## 7. Pooping: the autonomous side

The pet poops on its own schedule. Server‑authoritative because it depends on `hunger` history and we don't want the client deciding when poos happen (otherwise: spam‑poo for cleanup‑bond grinding).

### 7.1 Scheduling

All poop logic lives in `fastapi-server/app/services/pet_poo.py` so the feed handler, the state route, and tests share one source of truth.

When `pet_stats.next_poo_at` is `NULL` or in the past, compute the next poo time. The interval is shaped by **hunger** (starving pets have nothing to process) and **digestion quality** (cheap food → frequent poop — the [§3.5](#35-food-quality--the-happinesspoop-economy) economy):

```python
# fastapi-server/app/services/pet_poo.py
import random
from datetime import datetime, timezone, timedelta

from app.models.pet_stats import PetStats

POO_INTERVAL_MIN = timedelta(minutes=45)
POO_INTERVAL_MAX = timedelta(hours=3)
MAX_POOS_PER_READ = 5          # welcome-back cap (§7.2)

def schedule_next_poo(stats: PetStats) -> None:
    base = random.uniform(POO_INTERVAL_MIN.total_seconds(), POO_INTERVAL_MAX.total_seconds())

    # Starving pets poo less: hunger 100 → 1.0 (normal), hunger 0 → ~3.3 (much longer).
    hunger_factor = max(0.3, stats.hunger / 100)

    # Digestion drives frequency. digestion_quality 3 (standard) is neutral (1.0);
    # 1 (junk) → 0.35 → poops ~3× as often; 5 (gourmet) → 1.67 → poops less.
    digestion_factor = max(0.35, min(1.8, stats.digestion_quality / 3.0))

    seconds = (base / hunger_factor) * digestion_factor
    stats.next_poo_at = datetime.now(timezone.utc) + timedelta(seconds=seconds)
```

With the average base interval (~112 min), a full-hunger pet poops roughly every **~40 min on a scraps diet** (digestion ≈ 1 → factor 0.35) versus every **~3 h on gourmet** (digestion ≈ 5 → factor 1.67). Since `digestion_quality` is an EMA it won't sit at the extremes after one meal, but a steady cheap-food habit pushes it down and keeps the screen covered — the visible "more poop" the cheap-food path promises.

### 7.2 Generation (lazy, on read)

On every `/pets/state` read, **after** decay is applied, check for due poos:

```python
# fastapi-server/app/services/pet_poo.py (continued)
from app.models.pet_instances import PetInstance
from app.models.pet_poos import PetPoo

def maybe_generate_poos(db, inst: PetInstance, stats: PetStats) -> list[PetPoo]:
    if stats.next_poo_at is None:
        schedule_next_poo(stats)
        return []

    now = datetime.now(timezone.utc)
    new_poos: list[PetPoo] = []

    # Loop because the user may have been offline for hours and accumulated several.
    while stats.next_poo_at <= now:
        if len(new_poos) < MAX_POOS_PER_READ:
            # Spawn at a rough screen position; the client clamps to its real viewport.
            new_poos.append(PetPoo(
                pet_instance_id=inst.id,
                user_id=inst.user_id,
                x=random.uniform(50, 1800),
                y=random.uniform(200, 900),
            ))
        # Always advance the clock, even past the cap, so we don't re-spill next read.
        schedule_next_poo(stats)

    if new_poos:
        db.add_all(new_poos)
    return new_poos
```

The `MAX_POOS_PER_READ` cap avoids a hilarious 200-poo welcome-back screen — anything past 5 is silently dropped, but `next_poo_at` still advances past all the missed events so they don't re-spawn on the next read.

### 7.3 Uncleaned poo penalty

The key coupling: **the more uncleaned poos on screen, the faster cleanliness rots.** The decay step scales the cleanliness loss by the live uncleaned count, so a screen full of cheap-food poop drags the pet toward the `dirty` mood quickly:

```python
cleanliness_decay = (0.3 + 0.5 * uncleaned_poos) * hours
#                    ^base       ^+0.5/hour per uncleaned poo
```

This lives inside `apply_decay` — the **canonical, runnable implementation is in [§7.6](#76-serving--rendering-poos--the-petsidstate-endpoint)** (`app/crud/pet_stats.py`), which also decays hunger/happiness/energy and uses `datetime.now(timezone.utc)`. The state route passes the count: `apply_decay(stats, count_uncleaned(db, user_id))`.

The "poos on screen" count comes from `SELECT COUNT(*) FROM pet_poos WHERE user_id=? AND cleaned_at IS NULL` (`crud.pet_poos.count_uncleaned`). Index `(user_id, cleaned_at)` makes it instant.

### 7.4 Pet behavior change before pooping

For comedy, the pet does a little dance before pooping. Client requests `/pets/{id}/state` periodically (or on focus); when the response includes a `pendingPoo: true` flag (set when `next_poo_at` is within 5 s), the client pushes `behavior:about_to_poo` for 3 seconds, then refreshes and the poo appears.

This means the actual poo render comes from a server fetch, not a client invention — keeps positions canonical and prevents desync.

### 7.5 Why not just put poos client‑side

You could. But then:
- Closing the tab and reopening loses all poos.
- A user who cleans a poo on Computer A still sees it on Computer B.
- Cleanliness stat penalty needs an authoritative count.

Server‑side poos are ~50 bytes per row. Fine.

### 7.6 Serving + rendering poos — the `/pets/{id}/state` endpoint

This is what turns the server's poo rows into 💩 on the screen. It's referenced all over this doc; here's the full implementation, backend and frontend.

#### Stats CRUD — `app/crud/pet_stats.py`

```python
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from app.models.pet_stats import PetStats

MAX_DECAY_WINDOW = timedelta(hours=8)   # offline grace (§3.3)

def get_or_create_stats(db: Session, pet_instance_id: int) -> PetStats:
    stats = db.query(PetStats).filter_by(pet_instance_id=pet_instance_id).first()
    if not stats:
        stats = PetStats(pet_instance_id=pet_instance_id)
        db.add(stats); db.commit(); db.refresh(stats)
    return stats

def apply_decay(stats: PetStats, uncleaned_poos: int = 0) -> None:
    """Lazy decay (§3.2). Mutates in place; caller commits. The cleanliness penalty
    scales with how many poos are currently sitting uncleaned on screen."""
    now = datetime.now(timezone.utc)
    elapsed = min(now - stats.snapshot_at, MAX_DECAY_WINDOW)
    hours = elapsed.total_seconds() / 3600

    cleanliness_decay = (0.3 + 0.5 * uncleaned_poos) * hours   # more poo → faster filth
    stats.cleanliness = max(0.0, stats.cleanliness - cleanliness_decay)
    stats.hunger      = max(0.0, stats.hunger    - 1.0 * hours)
    stats.happiness   = max(0.0, stats.happiness - 0.5 * hours)
    stats.energy      = max(0.0, stats.energy    - 0.8 * hours)  # simplification: always awake
    stats.snapshot_at = now

def write_stats(db: Session, stats: PetStats) -> None:
    db.add(stats)   # already session-attached; persisted on the caller's commit

def snapshot(stats: PetStats) -> dict:
    """Serialize the (already decayed) stats to the client shape. Handlers import this
    as `_snapshot` — e.g. `from app.crud.pet_stats import snapshot as _snapshot`."""
    return {
        "hunger":      round(stats.hunger, 1),
        "energy":      round(stats.energy, 1),
        "happiness":   round(stats.happiness, 1),
        "cleanliness": round(stats.cleanliness, 1),
        "bond":        round(stats.bond, 1),
    }

def compute_mood(stats: PetStats) -> str:
    """The §3.4 thresholds, evaluated worst-first."""
    if stats.energy < 30:      return "tired"
    if stats.hunger < 30:      return "hungry"
    if stats.happiness < 30:   return "sad"
    if stats.cleanliness < 30: return "dirty"
    if min(stats.hunger, stats.energy, stats.happiness, stats.cleanliness) >= 60:
        return "happy"
    return "content"
```

#### Poo CRUD — `app/crud/pet_poos.py`

```python
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.pet_poos import PetPoo

def list_uncleaned(db: Session, user_id: int) -> list[PetPoo]:
    return db.query(PetPoo).filter_by(user_id=user_id, cleaned_at=None).all()

def count_uncleaned(db: Session, user_id: int) -> int:
    return db.query(PetPoo).filter_by(user_id=user_id, cleaned_at=None).count()

def clean_one(db: Session, user_id: int, poo_id: int) -> bool:
    poo = db.query(PetPoo).filter_by(id=poo_id, user_id=user_id, cleaned_at=None).first()
    if not poo:
        return False
    poo.cleaned_at = datetime.now(timezone.utc)
    return True
```

> `handle_clean` (§6.4) can call `clean_one(db, user_id, poo_id)` instead of inlining the query.

#### The state route — add to `app/routes/pet_interactions.py`

```python
from datetime import datetime, timezone, timedelta

from app.crud.pets import get_instance_for_user
from app.crud.pet_stats import (
    get_or_create_stats, apply_decay, write_stats, snapshot as _snapshot, compute_mood,
)
from app.crud.pet_poos import list_uncleaned, count_uncleaned
from app.crud.pet_interaction_log import last_occurrence
from app.services.pet_poo import maybe_generate_poos
from app.services.interactions import registry as interactions

@router.get("/{instance_id}/state")
def state(instance_id: str, request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    inst = get_instance_for_user(db, session.user_id, instance_id)
    if not inst:
        raise HTTPException(404, "Pet not found")

    stats = get_or_create_stats(db, inst.id)

    # decay first (cleanliness penalty needs the live uncleaned count), then spawn due poos
    uncleaned_count = count_uncleaned(db, session.user_id)
    apply_decay(stats, uncleaned_count)
    maybe_generate_poos(db, inst, stats)   # mutates stats.next_poo_at, adds rows
    write_stats(db, stats)
    db.commit()

    now = datetime.now(timezone.utc)
    pending = stats.next_poo_at is not None and (stats.next_poo_at - now) <= timedelta(seconds=5)

    return {
        "ok": True,
        "state": {
            "instanceId": inst.instance_id,
            "stats": _snapshot(stats),
            "mood": compute_mood(stats),
            "poos": [
                {"id": p.id, "x": p.x, "y": p.y, "createdAt": p.created_at.isoformat()}
                for p in list_uncleaned(db, session.user_id)
            ],
            "pendingPoo": pending,
            "cooldowns": _active_cooldowns(db, inst.id),
        },
    }

def _active_cooldowns(db, pet_instance_id: int) -> dict[str, int]:
    """Per-interaction ms remaining, so the client can grey out buttons."""
    out: dict[str, int] = {}
    now = datetime.now(timezone.utc)
    for h in interactions.all_handlers():
        last = last_occurrence(db, pet_instance_id, h.id)
        if last:
            remaining = h.cooldown_ms - int((now - last).total_seconds() * 1000)
            if remaining > 0:
                out[h.id] = remaining
    return out
```

Add `all_handlers()` to the handler registry (§5.4):

```python
def all_handlers() -> list[Handler]:
    return list(_handlers.values())
```

#### Client hook — `client/src/modules/pets/hooks/usePetState.ts`

```ts
import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'

export interface Poo { id: number; x: number; y: number; createdAt: string }
export interface Stats { hunger: number; energy: number; happiness: number; cleanliness: number; bond: number }
export type Mood = 'happy' | 'content' | 'tired' | 'hungry' | 'sad' | 'dirty'

export interface PetState {
    instanceId: string
    stats: Stats
    mood: Mood
    poos: Poo[]
    pendingPoo: boolean
    cooldowns: Record<string, number>
}

const POLL_MS = 30_000   // stats decay slowly; 30s is plenty

export function usePetState(instanceId: string | null) {
    const [state, setState] = useState<PetState | null>(null)

    const fetchState = useCallback(async () => {
        if (!instanceId) return
        const res = await fetch(`${serverUrl}/pets/${instanceId}/state`, { credentials: 'include' })
        const data = await res.json()
        if (data.ok) setState(data.state)
    }, [instanceId])

    useEffect(() => {
        if (!instanceId) return
        fetchState()
        const id = setInterval(fetchState, POLL_MS)
        window.addEventListener('focus', fetchState)   // catch up after the tab was hidden
        return () => { clearInterval(id); window.removeEventListener('focus', fetchState) }
    }, [instanceId, fetchState])

    // optimistic removal for the clean interaction (rolled back via refetch on error)
    const removePooLocal = useCallback((pooId: number) => {
        setState(s => (s ? { ...s, poos: s.poos.filter(p => p.id !== pooId) } : s))
    }, [])

    return { state, refetch: fetchState, removePooLocal }
}
```

#### Poo sprite — `client/src/modules/pets/components/PooSprite.tsx`

```tsx
import { dispatch } from '../interactions/dispatcher'
import type { Poo } from '../hooks/usePetState'
import type { RuntimePet } from '../models/pet'

export function PooSprite({
    poo, pet, removeLocal, rollback,
}: {
    poo: Poo
    pet: RuntimePet
    removeLocal: () => void   // optimistic remove from the owning pet's state
    rollback: () => void      // re-fetch truth if the server rejects
}) {
    return (
        <div
            className="absolute pointer-events-auto cursor-pointer select-none"
            style={{
                transform: `translate(${poo.x}px, ${poo.y}px)`,
                fontSize: 24,
                willChange: 'transform',
            }}
            title="Clean me!"
            onClick={e =>
                dispatch(
                    'click',
                    {
                        pet,
                        pointer: { x: e.clientX, y: e.clientY },
                        // poo/removeLocal/rollback are client-only; only pooId is sent (§6.4)
                        payload: { pooId: poo.id, poo: { x: poo.x, y: poo.y }, removeLocal, rollback },
                    },
                    'clean',   // explicit id → run the `clean` handler, not the pet `click`
                )
            }
        >
            💩
        </div>
    )
}
```

#### Per-pet layer — `client/src/modules/pets/components/PetStateLayer.tsx`

One per active pet. Renders its poos + vitals and runs the pre-poo comedy beat.

```tsx
import { useEffect } from 'react'
import { usePetState } from '../hooks/usePetState'
import { PooSprite } from './PooSprite'
import { PetVitals } from './PetVitals'
import { pushBehavior } from '../engine/behaviorRegistry'
import type { RuntimePet } from '../models/pet'

export function PetStateLayer({ pet }: { pet: RuntimePet }) {
    const { state, refetch, removePooLocal } = usePetState(pet.instanceId)

    // When a poo is imminent (pendingPoo), squat for 3s, then refetch to reveal it.
    useEffect(() => {
        if (!state?.pendingPoo) return
        pushBehavior(pet, 'about_to_poo', 3000)
        const t = setTimeout(refetch, 3200)
        return () => clearTimeout(t)
    }, [state?.pendingPoo, pet, refetch])

    if (!state) return null

    return (
        <>
            {state.poos.map(poo => (
                <PooSprite
                    key={poo.id}
                    poo={poo}
                    pet={pet}
                    removeLocal={() => removePooLocal(poo.id)}
                    rollback={refetch}
                />
            ))}
            <PetVitals pet={pet} stats={state.stats} mood={state.mood} />
        </>
    )
}
```

#### Wiring into the overlay

Add `<PetStateLayer>` alongside `<PetSprite>` in the `Pets` overlay from [pet.md §7.2](./pet.md#72-wiring-active-pets-into-the-engine):

```tsx
return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
        {pets.map(p => (
            <Fragment key={p.instanceId}>
                <PetSprite pet={p} />
                <PetStateLayer pet={p} />   {/* poos + vitals + pre-poo beat */}
            </Fragment>
        ))}
    </div>
)
```

Because each `PetStateLayer` owns its pet's `usePetState`, there's no global poo store and no cross-pet coupling — cleaning a poo optimistically updates exactly the pet that owns it.

---

## 8. Reaction behaviors (FSM extensions)

Built‑in interactions reference these behavior ids. Each is a one‑file behavior (per [pets-usage.md §2](./pets-usage.md#2-add-a-new-behavior)).

| Behavior id | Triggered by | Visual | Duration |
|---|---|---|---|
| `happy_bounce` | `pet` interaction | Small vertical bounce, 2x | 1200 ms |
| `held_wiggle` | pickup begin | Subtle squash/stretch on the held sprite (CSS transform pulse) | until release |
| `falling` | dropped from height | Gravity Y, arms/tail flailing animation | until floor |
| `landed` | dropped from low height | Squish, dust puff | 600 ms |
| `dizzy` | after `play` | Stars over head, slow random nudges | 800 ms |
| `eating` | `feed` (quality ≥ 3) | Sits, chomp animation, particles | 2500 ms |
| `disgust` | `feed` (quality ≤ 2) | Recoils, 🤢 particle, eats reluctantly | 2500 ms |
| `tail_wag` | `clean` | Walk animation in place | 800 ms |
| `come_here` | `call` | Like `follow`, but with the right‑click position as target | 3000 ms |
| `about_to_poo` | imminent poo | Pet squats and looks around shiftily | 3000 ms |
| `hungry_whine` | mood = hungry, every ~60s | Sit + sad sprite + speech bubble | 2000 ms |

Each is ~30 lines. They mostly differ in: which sprite sheet to use (set via species `animations`), what to do to `targetVx/Vy`, and what particle/audio cue to fire. If a species doesn't have a sprite sheet for a given reaction behavior, the dispatcher falls back to the species's `idle` sheet — animations still play (badly), but nothing crashes.

**Sprite‑sheet expectations**: any species that wants the full interactive experience should provide PNGs for `happy_bounce`, `eating`, `held_wiggle`, `tail_wag`, `about_to_poo`. Drop them into `fastapi-server/pet_assets/<species_id>/` per [pets-usage.md §1](./pets-usage.md#1-add-a-new-pet-species-end-to-end). The species's `config.animations` JSON declares the frame counts.

---

## 9. Food shop and inventory

Food is the points sink that powers the [§3.5](#35-food-quality--the-happinesspoop-economy) economy: buy food with points, drag it onto the pet to feed. Cheap food is a trap (unhappy pet + poop to clean); quality food costs more points but keeps the pet happy and the screen clean.

### 9.1 Server: CRUD and routes

**`app/crud/food.py`** — full module:

```python
from sqlalchemy import update
from sqlalchemy.orm import Session
from app.models.food_items import FoodItem
from app.models.user_food_inventory import UserFoodInventory

def list_food(db: Session) -> list[FoodItem]:
    return (db.query(FoodItem)
              .filter_by(enabled=True)
              .order_by(FoodItem.price_points)
              .all())

def get_food(db: Session, item_id: str) -> FoodItem | None:
    return db.query(FoodItem).filter_by(item_id=item_id).first()

def current_quantity(db: Session, user_id: int, item_id: str) -> int:
    row = db.query(UserFoodInventory).filter_by(user_id=user_id, item_id=item_id).first()
    return row.quantity if row else 0

def add_food(db: Session, user_id: int, item_id: str, qty: int) -> int:
    row = db.query(UserFoodInventory).filter_by(user_id=user_id, item_id=item_id).first()
    if row:
        row.quantity += qty
    else:
        row = UserFoodInventory(user_id=user_id, item_id=item_id, quantity=qty)
        db.add(row)
    db.commit()
    return row.quantity

def consume_one(db: Session, user_id: int, item_id: str) -> bool:
    """Atomic decrement used by the feed handler (§6.3). Race-free via the
    `quantity > 0` guard — two concurrent feeds can't both succeed."""
    rows = db.execute(
        update(UserFoodInventory)
            .where(
                UserFoodInventory.user_id == user_id,
                UserFoodInventory.item_id == item_id,
                UserFoodInventory.quantity > 0,
            )
            .values(quantity=UserFoodInventory.quantity - 1)
    ).rowcount
    db.commit()
    return rows > 0
```

**`app/routes/food.py`** — full router. Buying mirrors the existing themes flow ([themes.py:54‑80](../fastapi-server/app/routes/themes.py#L54-L80)) but supports a quantity:

```python
from fastapi import APIRouter, Depends, HTTPException, Request

from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud.user_points import get_points_by_user_id, update_user_points
from app.crud.food import list_food, get_food, add_food, current_quantity
from app.models.user_food_inventory import UserFoodInventory

router = APIRouter(prefix="/food", tags=["food"])

def _food_dto(f) -> dict:
    return {
        "itemId": f.item_id,
        "displayName": f.display_name,
        "pricePoints": f.price_points,
        "iconKey": f.icon_key,
        "quality": f.quality,        # 1..5 — drives the UI quality stars + warnings
        "effects": f.effects,
    }

@router.get("")
def catalog(request: Request, db = Depends(get_db)):
    get_session_from_request(db, request)
    return {"ok": True, "items": [_food_dto(f) for f in list_food(db)]}

@router.post("/{item_id}/buy")
def buy_food(item_id: str, request: Request, qty: int = 1, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    if qty < 1 or qty > 99:
        raise HTTPException(400, "Quantity must be 1–99")

    food = get_food(db, item_id)
    if not food or not food.enabled:
        raise HTTPException(404, "Unknown food")

    pts = get_points_by_user_id(db, session.user_id)
    total = food.price_points * qty
    if pts.points < total:
        raise HTTPException(400, "Not enough points")

    update_user_points(db, session.user_id, pts.points - total)
    qty_now = add_food(db, session.user_id, item_id, qty)

    return {
        "ok": True,
        "itemId": item_id,
        "quantity": qty_now,
        "pointsRemaining": pts.points - total,
    }

@router.get("/inventory")
def my_food(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    rows = db.query(UserFoodInventory).filter_by(user_id=session.user_id).all()
    return {"ok": True, "items": [
        {"itemId": r.item_id, "quantity": r.quantity}
        for r in rows if r.quantity > 0
    ]}
```

Register it in [main.py](../fastapi-server/app/main.py):

```python
from app.routes import food
app.include_router(food.router)
```

> **Debit/grant atomicity.** Like the existing themes route, this isn't wrapped in one transaction. For points that's acceptable (a crash leaves the user with points and no food — recoverable). If you want belt-and-suspenders, wrap debit + `add_food` the way `/lootboxes/{sku}/open` does in [pet.md §6.2](./pet.md#62-route--approuteslootboxespy), and accept an `Idempotency-Key` (§10.3).

### 9.2 Seed catalog (with quality)

The ladder below is the whole point: a cheap, filling, **low-quality** option (`scraps`) that's a false economy, up to an expensive **gourmet** one. Note `effects` JSON uses **plain numbers** — no leading `+` (invalid JSON); negatives are fine.

```python
# in an Alembic data migration
INSERT INTO food_items (item_id, display_name, price_points, icon_key, quality, effects, enabled) VALUES
    ('scraps',        'Table Scraps',  2,   'scraps', 1, '{"hunger":20}',                      true),
    ('kibble',        'Kibble',        5,   'kibble', 2, '{"hunger":15}',                      true),
    ('tasty_bowl',    'Tasty Bowl',    12,  'bowl',   3, '{"hunger":25,"happiness":3}',        true),
    ('premium_can',   'Premium Can',   25,  'can',    4, '{"hunger":40}',                      true),
    ('gourmet_feast', 'Gourmet Feast', 60,  'feast',  5, '{"hunger":50}',                      true),
    ('treat',         'Treat',         10,  'treat',  4, '{"hunger":5}',                       true),
    ('coffee',        'Coffee',        20,  'mug',    2, '{"energy":30}',                      true),
    ('cake',          'Birthday Cake', 200, 'cake',   5, '{"hunger":30,"energy":10,"happiness":10}', true)
```

How the ladder plays out at feed time (quality happiness from [§3.5](#35-food-quality--the-happinesspoop-economy), added to any `effects.happiness`):

| Food | Price | Quality | Hunger | Net happiness | Poop tendency |
|---|---|---|---|---|---|
| Table Scraps | 2 | ★☆☆☆☆ | +20 | **−8** | floods the screen |
| Kibble | 5 | ★★☆☆☆ | +15 | **−3** | frequent |
| Tasty Bowl | 12 | ★★★☆☆ | +25 | +1 (+3) = **+4** | baseline |
| Premium Can | 25 | ★★★★☆ | +40 | **+5** | reduced |
| Gourmet Feast | 60 | ★★★★★ | +50 | **+10** | rare |

`coffee` (quality 2) is the deliberate gag: cheap energy, but it makes the pet a bit miserable *and* poop more — exactly like real life.

### 9.3 Client: the `useFood` hook

`client/src/modules/pets/hooks/useFood.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'

export interface FoodItem {
    itemId: string
    displayName: string
    pricePoints: number
    iconKey: string
    quality: number                       // 1..5
    effects: Record<string, number>
}

export function useFood() {
    const [catalog, setCatalog] = useState<FoodItem[]>([])
    const [inventory, setInventory] = useState<Record<string, number>>({})

    const fetchCatalog = useCallback(async () => {
        const res = await fetch(`${serverUrl}/food`, { credentials: 'include' })
        const data = await res.json()
        if (data.ok) setCatalog(data.items)
    }, [])

    const fetchInventory = useCallback(async () => {
        const res = await fetch(`${serverUrl}/food/inventory`, { credentials: 'include' })
        const data = await res.json()
        if (data.ok) {
            const map: Record<string, number> = {}
            for (const it of data.items) map[it.itemId] = it.quantity
            setInventory(map)
        }
    }, [])

    useEffect(() => { fetchCatalog(); fetchInventory() }, [fetchCatalog, fetchInventory])

    // Decrement locally when the pet is fed (the `pet:fed` event from feed.ts, §6.3).
    useEffect(() => {
        const onFed = (e: Event) => {
            const itemId = (e as CustomEvent).detail?.itemId as string
            setInventory(prev => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] ?? 0) - 1) }))
        }
        window.addEventListener('pet:fed', onFed)
        return () => window.removeEventListener('pet:fed', onFed)
    }, [])

    const buy = useCallback(async (itemId: string, qty = 1) => {
        const res = await fetch(`${serverUrl}/food/${itemId}/buy?qty=${qty}`, {
            method: 'POST',
            credentials: 'include',
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.detail ?? 'buy failed')
        setInventory(prev => ({ ...prev, [itemId]: data.quantity }))
        return data as { quantity: number; pointsRemaining: number }
    }, [])

    return { catalog, inventory, buy, refetch: fetchInventory }
}
```

### 9.4 Client: the `FoodShop` component

Reuses the points context and matches [`ThemeShop`](../client/src/modules/themes/index.tsx). Open it from the `FoodInventory` panel's "＋" button (§9.5) or anywhere the points display lives.

`client/src/modules/pets/components/FoodShop.tsx`:

```tsx
import { useState } from 'react'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { useFood, type FoodItem } from '../hooks/useFood'

const QUALITY_LABEL = ['', 'Poor', 'Cheap', 'Standard', 'Premium', 'Gourmet']
const stars = (q: number) => '★'.repeat(q) + '☆'.repeat(5 - q)

export function FoodShop() {
    const { catalog, inventory, buy } = useFood()
    const { points, fetchPoints } = usePointsContext()
    const [error, setError] = useState<string | null>(null)

    const handleBuy = async (item: FoodItem) => {
        try {
            await buy(item.itemId, 1)
            await fetchPoints()          // points were debited server-side
            setError(null)
        } catch (e) {
            setError((e as Error).message)
        }
    }

    return (
        <div className="flex items-center justify-center p-8 [background:var(--bg)] rounded-xl border">
            <div className="w-full max-w-lg">
                <h2 className="text-xl font-semibold mb-1 text-center">Food Shop</h2>
                <h3 className="text-center mb-4 underline font-bold">Points: {points}</h3>
                {error && <p className="text-red-400 text-center mb-2">{error}</p>}

                <div className="flex flex-col gap-2">
                    {catalog.map(item => {
                        const broke = points != null && points < item.pricePoints
                        return (
                            <div
                                key={item.itemId}
                                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center border rounded-xl px-3 py-2"
                            >
                                <div>
                                    <div className="font-semibold">{item.displayName}</div>
                                    <div className="text-xs opacity-70">
                                        {stars(item.quality)} {QUALITY_LABEL[item.quality]}
                                        {item.quality <= 2 && ' · upsets tummy 💩'}
                                    </div>
                                </div>
                                <span className="text-sm opacity-70">have {inventory[item.itemId] ?? 0}</span>
                                <button
                                    onClick={() => handleBuy(item)}
                                    disabled={broke}
                                    className={`text-black rounded-xl px-3 py-1 ${
                                        broke ? 'bg-teal-900 cursor-default' : 'bg-green-600 hover:bg-green-800'
                                    }`}
                                >
                                    Buy · {item.pricePoints}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
```

### 9.5 Client: the `FoodInventory` panel (drag-to-feed)

A floating tray of owned food. Each tile is draggable; dropping it on a pet fires the `feed` interaction ([§6.3](#63-feed)). The "＋" button opens the shop in a modal.

`client/src/modules/pets/components/FoodInventory.tsx`:

```tsx
import { useFood } from '../hooks/useFood'
import { useModal } from '../../../components/modal/ModalContext'
import { FoodShop } from './FoodShop'

// icon_key → emoji fallback until real sprite icons exist
const FOOD_EMOJI: Record<string, string> = {
    scraps: '🦴', kibble: '🥣', bowl: '🍲', can: '🥫',
    feast: '🍖', treat: '🍪', mug: '☕', cake: '🎂',
}

export function FoodInventory() {
    const { catalog, inventory } = useFood()
    const { openModal } = useModal()

    const owned = catalog.filter(c => (inventory[c.itemId] ?? 0) > 0)

    return (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 flex gap-2 items-end pointer-events-auto z-50">
            {owned.map(item => (
                <div
                    key={item.itemId}
                    draggable
                    onDragStart={e =>
                        e.dataTransfer.setData('application/x-pet-item', item.itemId)
                    }
                    className="relative w-12 h-12 border rounded-lg grid place-items-center cursor-grab select-none [background:var(--bg)]"
                    title={`${item.displayName} — quality ${item.quality}/5`}
                >
                    <span className="text-2xl">{FOOD_EMOJI[item.iconKey] ?? '🍽️'}</span>
                    <span className="absolute -bottom-1 -right-1 text-xs bg-black/70 text-white rounded-full px-1">
                        {inventory[item.itemId]}
                    </span>
                </div>
            ))}

            <button
                onClick={() => openModal(<FoodShop />)}
                className="w-12 h-12 border rounded-lg grid place-items-center [background:var(--bg)]"
                title="Open food shop"
            >
                ＋
            </button>
        </div>
    )
}
```

Mount it once, next to the `Pets` overlay (e.g. in [App.tsx](../client/src/App.tsx)). The drag payload key `application/x-pet-item` is exactly what `PetSprite`'s `onDrop` reads in [§5.3](#53-client-wiring-pointer-events).

---

## 10. Security, anti‑cheat, rate limits

### 10.1 The threat model

| Attack | Mitigation |
|---|---|
| Spam‑click `pet` for happiness | 2 s server‑enforced cooldown via `pet_interaction_log`. |
| Spam‑click `clean` after auto‑spawning poos client‑side | Poos only exist server‑side; `clean` validates the poo row. |
| Replay a successful feed response without the food | `consume_one` is an atomic UPDATE with `quantity > 0` guard. |
| POST `feed` with `payload.delta = {happiness: 9999}` | Server **ignores client‑sent deltas**. Stats only move through registered handlers. |
| Feed junk but send `payload.quality = 5` to dodge the unhappiness + extra poop | `quality` and `effects` are read **only** from the `food_items` row by `itemId`; the client never supplies them. The payload carries `itemId` and nothing stat-bearing. |
| Buy food, then forge an `/food/.../buy` response to fake inventory | Inventory is server-truth in `user_food_inventory`; `consume_one` validates the real row at feed time, so a faked balance feeds nothing. |
| Call `/pets/{id}/interact` on someone else's pet | `get_instance_for_user(db, session.user_id, instance_id)` returns None → 404. |
| Open many tabs to multiply effective cooldown | Cooldown is keyed on `(pet_instance_id, interaction_id)` server‑side; tabs share. |
| Inflate `bond` via long automated play sessions | `play` cooldown is 10 s + 8 pts happiness = `energy` floor kicks in within minutes; pet falls asleep. Diminishing returns built in. |
| Modify client to remove `pointer-events-none` on the overlay and click‑through into UI | Cosmetic — server doesn't care. Worst case the user spoils their own UX. |

### 10.2 Per‑user rate limiting

Above and beyond per‑interaction cooldowns, add a sliding‑window cap: **max 60 interactions per minute per user**, returns 429. Catches scripted abuse without inconveniencing humans (who max out around 20/min even when frantic).

Simple in‑memory token bucket in `ConnectionManager` style works fine for single‑process; if you scale to multiple workers, move it to Redis.

### 10.3 Idempotency

Interactions that mutate items (`feed`) should accept `Idempotency-Key` header per the same pattern as `/lootboxes/{sku}/open` in [pet.md §6.3](./pet.md#63-optional-ratelimit-and-idempotency). A retried feed on a flaky connection must not double‑consume the food.

### 10.4 Audit trail

Every interaction lands in `pet_interaction_log`. When a user reports "my food is gone but my pet didn't eat anything," you can replay their last 100 actions in one query. Don't underestimate how much this saves you.

---

## 11. UI: vitals, notifications, accessibility

### 11.1 Vitals chip

A small floating element that appears next to the active pet on hover, showing five colored bars (one per stat). Hidden by default — appears on pet hover after 400 ms (avoids drive‑by hovers cluttering the screen). Per‑user setting to pin it.

```tsx
// client/src/modules/pets/components/PetVitals.tsx
const MOOD_EMOJI = { happy: '😀', content: '🙂', tired: '😴', hungry: '🍽️', sad: '😢', dirty: '🦨' }

export function PetVitals({ pet, stats, mood }) {
    return (
        <div className="absolute pointer-events-none" style={vitalsPosition(pet)}>
            <div className="text-center text-sm">{MOOD_EMOJI[mood]} {mood}</div>
            <Bar value={stats.hunger}      color={stats.hunger < 30 ? 'red' : 'green'}  label="🍖" />
            <Bar value={stats.energy}      color={stats.energy < 30 ? 'orange' : 'blue'} label="⚡" />
            <Bar value={stats.happiness}   color={stats.happiness < 30 ? 'red' : 'pink'} label="❤️" />
            <Bar value={stats.cleanliness} color={stats.cleanliness < 30 ? 'brown' : 'cyan'} label="🛁" />
            <BondBar value={stats.bond} />
        </div>
    )
}
```

The `mood` here is exactly what `/pets/{id}/state` returns (server-computed in `compute_mood`, §7.6) and what `PetStateLayer` (§7.6) passes down — so a pet fed nothing but scraps visibly reads `😢 sad` / `🦨 dirty`.

### 11.2 Notifications

Throttled toasts via the existing toast system (or build a tiny one). Hard rules:
- Max one stat‑low notification per stat per 60 minutes.
- Never show notifications for the same pet more than every 15 minutes regardless of stat.
- Mute toggle in user preferences. Default: notifications on.

### 11.3 Accessibility

- Every interaction has a keyboard shortcut (settings → bindings).
- The pet sprite has `aria-label="Cat (active pet) — hunger 80, energy 40, click to pet"`.
- Reduced motion: respect `prefers-reduced-motion`. `held_wiggle` and `dizzy` reactions skip their bounce/spin and just hold the sprite.
- Focus ring on the pet when keyboard‑focused; Enter triggers `pet` interaction.

---

## 12. Extending the system

### 12.1 Adding a new interaction (e.g. "scratch behind ears")

1. **Server**: `fastapi-server/app/services/interactions/scratch_handler.py`:
   ```python
   def handle_scratch(db, user_id, inst, stats, payload):
       stats.happiness = min(100, stats.happiness + 4)
       stats.bond = min(1000, stats.bond + 1.5)
       return InteractionResult(
           delta={"happiness": +4, "bond": +1.5},
           new_stats=_snapshot(stats),
           reaction={"behaviorId": "leg_kick", "durationMs": 1500},
       )
   register(Handler(id="scratch", cooldown_ms=4000, fn=handle_scratch))
   ```
2. **Client**: `client/src/modules/pets/interactions/scratch.ts` — registers with `trigger: 'long_press'`.
3. **Optional reaction behavior**: if `leg_kick` doesn't exist yet, add it per [pets-usage.md §2](./pets-usage.md#2-add-a-new-behavior). Add a PNG, declare `animations.leg_kick`.

That's it. No DB migration, no route changes.

### 12.2 Adding a new stat (e.g. "thirst")

Heavier — touches the schema.

1. Alembic migration adds `thirst` column to `pet_stats`, default 80.
2. Update `apply_decay` to decay thirst.
3. Update mood computation to include thirst thresholds.
4. Add `water_bowl` food (effects: `{"thirst": 50}` — plain JSON number, no leading `+`) to the catalog.
5. Update the UI `PetVitals` bar layout.

Test the operational guardrails in [pets-usage.md §8](./pets-usage.md#operational-tests-to-keep-in-ci): make sure existing food still works (their effects JSON doesn't reference `thirst`, which is fine — handler skips unknown stats).

### 12.3 Adding a new item category (toys, accessories)

The premature‑generalization warning from [§4](#4-database-additions) flips here — once you have *two* item types, build the generalization:

1. Rename `food_items` → `items` (Alembic), add `category: str` column (default 'food').
2. Rename `user_food_inventory` → `user_inventory`.
3. Add `category` filter to all item routes; namespace inventory by category in the UI.
4. New interactions like `toss` (for a ball toy) register the same way as `feed`.

### 12.4 Multiplayer / shared screens

Not in scope today. The hooks for it: route interactions through WebSocket for real‑time broadcast, give poos a `visible_to: user_id | null` column (null = visible to friends), extend `pet_instances` with a `visibility` enum. Defer until product wants it.

### 12.5 Achievements

Cheap to add: a new table `pet_achievements (user_id, achievement_id, unlocked_at)` plus a function `check_achievements(db, user_id, interaction)` called from the interact route after the handler returns. Each achievement is a Python predicate against the interaction log.

```python
ACHIEVEMENTS = [
    Achievement("first_feed", lambda db, uid: count(db, uid, "feed") >= 1),
    Achievement("100_pets",   lambda db, uid: count(db, uid, "pet") >= 100),
    Achievement("clean_freak", lambda db, uid: count(db, uid, "clean") >= 50),
    Achievement("bond_500",    lambda db, uid: max_bond(db, uid) >= 500),
]
```

---

## 13. Testing

### 13.1 Server unit tests

```python
def test_pet_cooldown_enforced(client, user, pet):
    r1 = client.post(f"/pets/{pet.instance_id}/interact", json={"interaction_id": "pet"})
    assert r1.status_code == 200
    r2 = client.post(f"/pets/{pet.instance_id}/interact", json={"interaction_id": "pet"})
    assert r2.status_code == 429
    assert r2.json()["detail"]["reason"] == "cooldown"

def test_feed_consumes_food(client, user, pet, kibble_inventory_5):
    client.post(f"/pets/{pet.instance_id}/interact",
                json={"interaction_id": "feed", "payload": {"itemId": "kibble"}})
    assert current_quantity(db, user.id, "kibble") == 4

def test_feed_without_food_fails_and_does_not_change_stats(client, user, pet_full_stats):
    r = client.post(f"/pets/{pet.instance_id}/interact",
                    json={"interaction_id": "feed", "payload": {"itemId": "kibble"}})
    assert r.status_code == 400
    stats = get_or_create_stats(db, pet.id)
    assert stats.hunger == 80.0   # unchanged

def test_low_quality_food_lowers_happiness(client, user, pet, scraps_inventory_1):
    before = get_or_create_stats(db, pet.id).happiness
    r = client.post(f"/pets/{pet.instance_id}/interact",
                    json={"interaction_id": "feed", "payload": {"itemId": "scraps"}})
    assert r.json()["delta"]["happiness"] == -8.0   # quality-1 penalty
    assert get_or_create_stats(db, pet.id).happiness == before - 8.0

def test_high_quality_food_raises_happiness(client, user, pet, gourmet_inventory_1):
    r = client.post(f"/pets/{pet.instance_id}/interact",
                    json={"interaction_id": "feed", "payload": {"itemId": "gourmet_feast"}})
    assert r.json()["delta"]["happiness"] == 10.0   # quality-5 bonus

def test_junk_food_brings_next_poo_forward(client, user, pet, scraps_inventory_1):
    set_next_poo(pet, hours_from_now=2)
    client.post(f"/pets/{pet.instance_id}/interact",
                json={"interaction_id": "feed", "payload": {"itemId": "scraps"}})
    stats = get_or_create_stats(db, pet.id)
    # scraps pulls the next poo to within ~90s, far sooner than the original 2h
    assert (stats.next_poo_at - now_utc()).total_seconds() <= 90

def test_quality_drives_digestion_ema(client, user, pet, scraps_inventory_3):
    # repeatedly feeding quality-1 food drags digestion_quality down from 3.0
    for _ in range(3):
        client.post(f"/pets/{pet.instance_id}/interact",
                    json={"interaction_id": "feed", "payload": {"itemId": "scraps"}})
        advance_clock(seconds=4)   # clear the 3s feed cooldown
    assert get_or_create_stats(db, pet.id).digestion_quality < 2.0

def test_buy_food_debits_points_and_grants_inventory(client, user_with_points_100):
    r = client.post("/food/kibble/buy?qty=3")
    assert r.json()["pointsRemaining"] == 100 - 5 * 3
    assert r.json()["quantity"] == 3

def test_buy_food_insufficient_points_no_debit(client, user_with_points_1):
    r = client.post("/food/gourmet_feast/buy")
    assert r.status_code == 400
    assert get_points_by_user_id(db, user.id).points == 1   # untouched

def test_feed_ignores_client_supplied_quality(client, user, pet, scraps_inventory_1):
    # forging quality in the payload must not dodge the unhappiness penalty
    r = client.post(f"/pets/{pet.instance_id}/interact",
                    json={"interaction_id": "feed",
                          "payload": {"itemId": "scraps", "quality": 5, "delta": {"happiness": 99}}})
    assert r.json()["delta"]["happiness"] == -8.0   # server read quality from the row

def test_stats_decay_lazily(client, user, pet):
    advance_clock(hours=10)
    state = client.get(f"/pets/{pet.instance_id}/state").json()
    assert state["stats"]["hunger"] < 80   # decayed
    assert state["stats"]["hunger"] >= 80 - 8.0   # but only 8h worth (MAX_DECAY_WINDOW)

def test_poos_generate_lazily(client, user, pet):
    set_next_poo(pet, minutes_ago=5)
    state = client.get(f"/pets/{pet.instance_id}/state").json()
    assert len(state["poos"]) >= 1

def test_cleaning_unknown_poo_returns_404(client, user, pet):
    r = client.post(f"/pets/{pet.instance_id}/interact",
                    json={"interaction_id": "clean", "payload": {"pooId": 999_999}})
    assert r.status_code == 404

def test_interact_on_other_users_pet_returns_404(client, user_a, pet_of_user_b):
    r = client.post(f"/pets/{pet_of_user_b.instance_id}/interact",
                    json={"interaction_id": "pet"})
    assert r.status_code == 404   # not 403 — don't leak existence
```

### 13.2 Client tests (Vitest + JSDOM)

```ts
test('every registered interaction has a matching server handler in the manifest', async () => {
    await import('../interactions')   // self-register
    const manifest = await api.get('/pets/interactions/manifest')   // tiny route listing handler ids
    for (const def of allInteractions()) expect(manifest.includes(def.id)).toBe(true)
})

test('pickup → drop fires play if held > 500ms', () => {
    const pet = mockPet()
    beginPickup(pet, makePointer(100, 100))
    advanceTime(600)
    movePointer(200, 200)
    releasePointer(200, 200)
    expect(api.post).toHaveBeenCalledWith(`/pets/${pet.instanceId}/interact`,
        expect.objectContaining({ interaction_id: 'play' }))
})

test('held pet does not get physics-updated', () => {
    const pet = mockPet({ x: 100, y: 100, vx: 5, vy: 0 })
    pet._heldByUser = true
    updatePhysics(pet)
    expect(pet.x).toBe(100)   // not 105
})
```

### 13.3 Manual checklist before each release

- [ ] Click cat 10 times rapidly — see exactly 2–3 happiness updates (cooldown working), particles every click.
- [ ] Drag cat across screen, drop low — gentle landing. Drop from top — fall + landed reaction.
- [ ] Buy food in the shop — points drop, quantity appears in the `FoodInventory` tray.
- [ ] Drop kibble on cat — eat animation, hunger up, inventory badge down.
- [ ] Feed Table Scraps (quality 1) — pet reacts with `disgust`, happiness drops, and a poo appears within ~90 s.
- [ ] Feed Gourmet Feast (quality 5) — happy `eating`, happiness up, no early poo.
- [ ] Spend a few minutes feeding only cheap food — watch poos pile up and cleanliness/mood slide to `dirty`/`sad`.
- [ ] Wait ~5 min of activity, observe a poo appears.
- [ ] Click poo — cleared, sparkles, cleanliness up.
- [ ] Close tab for 30 min, reopen — stats decayed but pet is alive.
- [ ] Close tab for 24 h, reopen — at most 8 h of decay (offline grace working).
- [ ] Network throttle to slow 3G — optimistic particles still feel instant.

---

## 14. Rollout plan

| Phase | Scope | Time |
|---|---|---|
| 1 | Schema + framework | 2 d |
| | Migrations for `pet_stats`, `pet_interaction_log`, `pet_poos`, `food_items`, `user_food_inventory`. Empty interaction registry. `/pets/{id}/interact` route with cooldown + audit but no handlers. `/pets/{id}/state` endpoint returning stats + poos. Stats decay implemented. | |
| 2 | First interaction (pet) | 1 d |
| | `pet_handler.py` server, `pet.ts` client, `happy_bounce` reaction behavior, vitals chip wired to `/pets/{id}/state`, particles infra. End‑to‑end smoke test. | |
| 3 | Pickup + drop | 1 d |
| | Physics gate for `_heldByUser`, `falling`/`landed`/`held_wiggle` behaviors, gravity, `play` interaction. | |
| 4 | Food + feed + quality economy | 2 d |
| | `food_items.quality` + `pet_stats.digestion_quality`. Food catalog + buy + inventory routes. `FoodShop` + drag‑drop `FoodInventory`. `feed_handler.py` (quality → happiness + digestion). `eating`/`disgust` behaviors. Seed 8 foods across tiers 1–5. | |
| 5 | Pooping + cleaning | 1 d |
| | `app/services/pet_poo.py`: `schedule_next_poo` (hunger × digestion), capped `maybe_generate_poos`. `/pets/{id}/state`, `usePetState`, `<PooSprite>` + `<PetStateLayer>`, `clean` interaction, cleanliness penalty in decay. Junk food → visible poop within ~90s. | |
| 6 | Polish | 1 d |
| | Notifications, accessibility, talk/call, mood‑driven behavior weights. | |

≈ 8 days end to end. Each phase is shippable; the user gets a slightly more alive pet every release.

---

## 15. Implementation checklist

**Schema**
- [ ] Alembic migration: `pet_stats` (incl. `digestion_quality` default 3.0), `pet_interaction_log`, `pet_poos`, `food_items` (incl. `quality` default 3), `user_food_inventory`.
- [ ] Seed migration: 8 food items across quality tiers 1–5 (§9.2).
- [ ] Backfill: create a `pet_stats` row for every existing `pet_instance` with default values (incl. `digestion_quality = 3.0`).

**Server core**
- [ ] `app/services/interactions/registry.py` — Handler dataclass + `register`/`get`/`all_handlers`.
- [ ] `app/services/interactions/__init__.py` — imports each handler file so they self‑register.
- [ ] `app/services/pet_poo.py` — `schedule_next_poo` (hunger × digestion factors), `maybe_generate_poos` (capped).
- [ ] `app/crud/pet_stats.py` — `get_or_create_stats`, `apply_decay`, `write_stats`, `snapshot` (aka `_snapshot`), `compute_mood`.
- [ ] `app/crud/pet_interaction_log.py` — `last_occurrence`, `log_interaction`.
- [ ] `app/crud/pet_poos.py` — `list_uncleaned`, `count_uncleaned`, `clean_one`.
- [ ] `app/crud/food.py` — `list_food`, `get_food`, `consume_one`, `add_food`, `current_quantity`.
- [ ] `app/routes/pet_interactions.py` — `POST /pets/{id}/interact`, `GET /pets/{id}/state` (mood + poos + pendingPoo + cooldowns).
- [ ] `app/routes/food.py` — catalog (with `quality`) / buy (qty 1–99) / inventory; register in `main.py`.
- [ ] Per‑user 60 req/min rate limit middleware.

**Server interactions**
- [ ] `pet_handler.py` — `pet` (cooldown 2s).
- [ ] `play_handler.py` — `play` (cooldown 10s).
- [ ] `feed_handler.py` — `feed` (cooldown 3s, requires item): quality → happiness, digestion EMA, junk → early poo, `eating`/`disgust` reaction.
- [ ] `clean_handler.py` — `clean` (cooldown 500ms, requires pooId).
- [ ] `call_handler.py` — `call` (cooldown 5s).

**Pooping + food-quality economy**
- [ ] `schedule_next_poo` factors `hunger` **and** `digestion_quality` (cheap food → more poop).
- [ ] `maybe_generate_poos` capped at `MAX_POOS_PER_READ`, advances `next_poo_at` past the cap.
- [ ] `apply_decay` reads uncleaned poo count for the cleanliness penalty.
- [ ] Feed handler lowers happiness for quality ≤ 2 and raises it for quality ≥ 4 (§3.5 table).
- [ ] `/pets/{id}/state` includes `stats`, `mood`, `poos: [{id, x, y, createdAt}]`, `pendingPoo: bool`, `cooldowns`.

**Client framework**
- [ ] `interactions/registry.ts` — `InteractionDef`, `registerInteraction`, `dispatch`.
- [ ] `interactions/index.ts` — imports all interactions so they self‑register.
- [ ] `engine/behaviorRegistry.ts` — add `pushBehavior(pet, id, ms)`.
- [ ] `engine/physics.ts` — gate on `_heldByUser` and `falling`.
- [ ] `shared/api.ts` + `shared/toast.ts` (§5.0) — REST wrapper (credentials + idempotency key) and toast stub.
- [ ] `fx/particles.ts` — basic canvas/DOM particle spawner.
- [ ] `hooks/usePetState.ts` — polls `/pets/{id}/state` (30s + on focus), `removePooLocal`.
- [ ] `hooks/useFood.ts` — catalog + inventory + `buy`, decrements on the `pet:fed` event.

**Client interactions + reactions**
- [ ] `interactions/pet.ts`, `pickup.ts`, `feed.ts` (emits `pet:fed`), `clean.ts` (uses payload `removeLocal`/`rollback`), `call.ts`.
- [ ] Reaction behavior files: `happy_bounce`, `held_wiggle`, `falling`, `landed`, `dizzy`, `eating`, `disgust`, `tail_wag`, `come_here`, `about_to_poo`, `hungry_whine`.
- [ ] Sprite sheets for each reaction added to each species in `fastapi-server/pet_assets/`.

**UI**
- [ ] `PetSprite` — `pointer-events-auto`, click/pointer/drop handlers wired to dispatcher.
- [ ] `PooSprite` + `PetStateLayer` (one per active pet) wired into the `Pets` overlay.
- [ ] `PetVitals` chip with hover‑reveal (takes `mood`).
- [ ] `FoodShop` component + `FoodInventory` drag‑to‑feed tray (opens shop via modal); mount `FoodInventory` near the overlay.
- [ ] Toast notifications throttled per stat.
- [ ] Reduced‑motion guards on bouncy reactions.
- [ ] Keyboard shortcut + ARIA labels on the active pet.

**Tests**
- [ ] All §13.1 server tests pass.
- [ ] All §13.2 client tests pass.
- [ ] Manual §13.3 checklist on staging before each release.

---

### Appendix A — Full Stats type (TypeScript)

```ts
export type StatId = 'hunger' | 'energy' | 'happiness' | 'cleanliness' | 'bond'

export interface Stats {
    hunger: number       // 0..100
    energy: number       // 0..100
    happiness: number    // 0..100
    cleanliness: number  // 0..100
    bond: number         // 0..1000
}

export type Mood = 'happy' | 'content' | 'tired' | 'hungry' | 'sad' | 'dirty'

export interface PetState {
    instanceId: string
    stats: Stats
    mood: Mood
    poos: Array<{ id: number; x: number; y: number; createdAt: string }>
    pendingPoo: boolean
    cooldowns: Record<string, number>   // interaction_id → ms remaining
}
```

### Appendix B — Why one endpoint for all interactions

Tempted to have `POST /pets/{id}/feed`, `POST /pets/{id}/pet`, `POST /pets/{id}/clean`? Don't. Reasons:

- Cooldown + audit + decay logic lives in one place. Adding a new interaction doesn't risk forgetting one of those steps.
- The contract is uniform; the client dispatcher doesn't need a route table.
- New interactions ship without backend route changes — just a handler file.
- Rate limiting is per "interaction request" regardless of type.

The only reason to break this rule is if an interaction has a fundamentally different shape (e.g. streaming, or requires a multipart upload). None of the pet interactions do.

### Appendix C — Why server‑side stats (vs client‑side with periodic sync)

A "stats live on the client, sync every 30 s" design is tempting (less latency, less DB writes). It fails:

- A user opens two tabs → two divergent stat sets → last writer wins → data loss.
- A user who knows what they're doing pokes the local state to max → posts the sync → server has no idea what was real.
- Closing the tab mid‑sync loses data.
- Achievements / leaderboards can't trust any value.

Server‑authoritative stats + cooldown‑gated interactions costs ~1 DB write per click. Postgres laughs at this. Don't optimize what isn't slow.
