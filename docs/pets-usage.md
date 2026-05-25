# Pet System — Usage & Extension Guide

A practical reference for adding new pets, behaviors, and lootboxes once the system in [pet.md](./pet.md) is in place. If you're reading this in a year — start at the [TL;DR](#tldr) and the [recipe](#1-add-a-new-pet-species-end-to-end).

> Architecture, rationale, and threat model live in [pet.md](./pet.md). This file is the operator manual.

---

## TL;DR

| I want to… | Do this |
|---|---|
| Add a new pet species | [§1](#1-add-a-new-pet-species-end-to-end): drop PNGs in `fastapi-server/pet_assets/<species_id>/`, insert one row into `pet_species`, optionally add to a lootbox `drop_table`. No deploy. |
| Add a new behavior | [§2](#2-add-a-new-behavior): write one file in `client/src/modules/pets/engine/behaviors/`, register it, reference its id from any species's `behaviorBag`. Client deploy only. |
| Add a new lootbox SKU | [§3](#3-add-a-new-lootbox-sku): insert one row into `lootboxes` with a `drop_table` JSON. No deploy. |
| Grant a pet to a user manually | [§4](#4-grant-or-revoke-pets-by-hand): insert into `pet_instances` with `source='grant'`. |
| Change drop rates / pity | [§5](#5-tune-drop-rates-without-a-deploy): update `lootboxes.drop_table` JSON. |
| Add a new animation type to existing species | [§6](#6-add-a-new-animation-state-to-an-existing-species): add the PNG, add an `animations` entry, optionally add to `behaviorBag`. |
| Make a limited-time / event pet | [§7](#7-limited-time-and-event-pets): set `enabled=false` outside the window, or gate via a separate lootbox SKU. |
| Debug "my new pet isn't showing up" | [§8](#8-troubleshooting). |

---

## Where things live

```
code-typings-mono/
├── fastapi-server/
│   ├── pet_assets/                      ← REAL SPRITE SHEETS (server-only, gitignored from client)
│   │   ├── cat/                         ← one folder per species_id
│   │   │   ├── idle.png
│   │   │   ├── wander.png
│   │   │   ├── follow_cursor.png
│   │   │   └── sleep.png
│   │   ├── shadow_fox/
│   │   │   └── ...
│   │   └── _silhouettes/                ← public preview PNGs for unowned species
│   │       └── shadow_fox.png
│   ├── app/
│   │   ├── models/
│   │   │   ├── pet_species.py           ← species table
│   │   │   ├── pet_instances.py         ← per-user owned pets
│   │   │   ├── lootbox.py               ← lootbox SKUs
│   │   │   └── lootbox_open.py          ← audit log
│   │   ├── crud/
│   │   │   ├── pets.py
│   │   │   └── lootboxes.py
│   │   ├── services/
│   │   │   ├── lootbox_roll.py          ← RNG + pity
│   │   │   └── pet_assets.py            ← HMAC URL signer
│   │   ├── routes/
│   │   │   ├── pets.py                  ← /pets/species, /pets/inventory
│   │   │   ├── lootboxes.py             ← /lootboxes, /lootboxes/{sku}/open
│   │   │   └── pet_assets.py            ← /pet-assets/{species_id}/{behavior}.png
│   │   └── migrations/versions/         ← Alembic migrations (incl. seed data)
└── client/src/modules/pets/
    ├── index.tsx                        ← Pets overlay component
    ├── models/pet.ts                    ← types
    ├── components/
    │   ├── PetSprite.tsx
    │   ├── LootboxStore.tsx
    │   └── LootboxRevealModal.tsx
    ├── engine/
    │   ├── PetEngine.ts
    │   ├── physics.ts
    │   ├── collisions.ts
    │   ├── animation.ts
    │   ├── behaviorRegistry.ts          ← register/lookup
    │   ├── behaviors/                   ← ONE FILE PER BEHAVIOR
    │   │   ├── idle.ts
    │   │   ├── wander.ts
    │   │   ├── follow_cursor.ts
    │   │   ├── sleep.ts
    │   │   └── index.ts                 ← imports them all so they self-register
    │   └── factory.ts                   ← toRuntimePet(instance, species)
    └── hooks/
        ├── usePetEngine.ts
        ├── usePets.ts
        ├── usePetSpecies.ts
        ├── usePetInventory.ts
        └── useLootboxes.ts
```

**Rule of thumb**: if it's *content* (species, lootboxes, drop rates, sprites), it lives on the server and is hot‑swappable. If it's *behavior code* (a new movement pattern, a new animation effect), it lives in the client and needs a deploy.

---

## Database tables (quick reference)

| Table | Owner | What it stores | Hot‑swappable? |
|---|---|---|---|
| `pet_species` | server content | One row per species. Includes display name, rarity, hitbox dimensions, `config` JSON (behaviorBag, animations, weights). | Yes — insert/update, no deploy |
| `pet_instances` | per‑user inventory | One row per pet a user owns. `(user_id, species_id, instance_id, nickname, active, source)`. | Yes — DB writes |
| `lootboxes` | server content | One row per lootbox SKU. Price + `drop_table` JSON. | Yes — insert/update |
| `lootbox_opens` | audit log | One row per open. Never edited by hand. | Read‑only in practice |
| `user_points` (existing) | per‑user currency | Used to pay for lootboxes. See [models/user_points.py](../fastapi-server/app/models/user_points.py). | n/a |

All schema changes go through Alembic, same pattern as [existing migrations](../fastapi-server/app/migrations/versions/). Don't edit tables by hand on prod — write a migration or a seed script.

---

## 1. Add a new pet species (end to end)

Example: adding `"shadow_fox"` (epic rarity).

### Step 1 — Make the sprite sheets

Four PNGs at `64×64` per frame, 6 frames wide (sheet = `384×64`). Match the conventions in `animations` (you can use other frame counts, just declare them in the species `animations` JSON). One PNG per behavior in the species's `behaviorBag`:

```
fastapi-server/pet_assets/shadow_fox/
    idle.png            (384×64, 6 frames)
    wander.png          (384×64, 6 frames)
    follow_cursor.png   (384×64, 6 frames)
    sleep.png           (256×64, 4 frames)
```

Plus a silhouette for the lootbox preview (anyone can see this):

```
fastapi-server/pet_assets/_silhouettes/shadow_fox.png
```

**Conventions** (not enforced, but the existing cat assets and [`animations`](../client/src/modules/pets/engine/animation.ts) in code follow them):

- Frame size: `64×64` unless you have a reason. Larger species need to update `width`/`height` in the species row.
- Sheets are **horizontal strips** (frames laid out left → right at `y = 0`).
- Pets face **right** by default; the engine handles left‑facing with `scaleX(-1)`.
- Transparent background, pixel art (the client sets `image-rendering: pixelated`).

### Step 2 — Insert the species row

Write an Alembic data migration. Don't `INSERT` against prod by hand — you'll have no record of what was added.

```python
# fastapi-server/app/migrations/versions/XXXX_add_shadow_fox.py
from alembic import op
import json

def upgrade():
    op.execute(f"""
        INSERT INTO pet_species (species_id, display_name, rarity, width, height,
                                 default_speed_x100, config, enabled)
        VALUES (
            'shadow_fox',
            'Shadow Fox',
            'epic',
            64, 64,
            40,
            '{json.dumps({
                "behaviorBag": ["idle", "wander", "follow_cursor", "sleep",
                                "wander", "wander"],
                "behaviorWeights": {"sleep": 0.5},
                "animations": {
                    "idle":          {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 4},
                    "wander":        {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 8},
                    "follow_cursor": {"frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 10},
                    "sleep":         {"frameWidth": 64, "frameHeight": 64, "frames": 4, "fps": 2}
                }
            })}',
            true
        )
    """)

def downgrade():
    op.execute("DELETE FROM pet_species WHERE species_id = 'shadow_fox'")
```

Run `alembic upgrade head`. Done — the species now appears in `/pets/species` responses with `owned: false` for everyone.

### Step 3 — Make it obtainable

Pick one of:

- **Add to an existing lootbox**: update that SKU's `drop_table.speciesByRarity.epic` to include `"shadow_fox"`. See [§5](#5-tune-drop-rates-without-a-deploy).
- **Create a dedicated lootbox SKU**: see [§3](#3-add-a-new-lootbox-sku). Use this for premium/event pets.
- **Grant manually**: insert into `pet_instances` for specific users. See [§4](#4-grant-or-revoke-pets-by-hand).

### What you do NOT have to do

- Touch the client.
- Restart the server (just re‑run migrations).
- Add asset imports anywhere — they're served by [`/pet-assets/{species_id}/{behavior}.png`](../fastapi-server/app/routes/pet_assets.py) with signed URLs.

### Fields on `pet_species`, explained

| Field | What it means | Notes |
|---|---|---|
| `species_id` | Stable string id, snake_case. Used in URLs, FKs, drop tables. | **Never rename** — existing `pet_instances` rows reference it. |
| `display_name` | Shown in UI. | Safe to change. |
| `rarity` | One of `common`, `uncommon`, `rare`, `epic`, `legendary`. | Used by lootbox drop tables. If you invent a new tier, you must also use it in some `drop_table.rarities`. |
| `width`, `height` | Pixel size of the rendered pet div. | Should match sprite frame size. |
| `default_speed_x100` | Speed × 100 (so `40` = 0.40 px/frame). | Stored as int to dodge SQLite float weirdness. |
| `config.behaviorBag` | Array of behavior ids — the pool `chooseBehavior` picks from. Duplicates = higher weight. | Every id must be registered on the client. |
| `config.behaviorWeights` | Optional per‑behavior weight overrides (multiplier). | Defaults to 1.0. |
| `config.animations` | One entry per behavior id this species uses. `{frameWidth, frameHeight, frames, fps}`. | Must have an entry for **every behavior** in `behaviorBag`, otherwise the engine fails over to `idle`. |
| `enabled` | If `false`, hidden from `/pets/species` and from lootbox rolls. | Use for un‑releasing a species without deleting data. |

---

## 2. Add a new behavior

Behaviors are client code — they encode movement logic. Adding one is one file + one import.

### Step 1 — Write the behavior file

`client/src/modules/pets/engine/behaviors/dash.ts`:

```ts
import { registerBehavior } from '../behaviorRegistry'

registerBehavior({
    id: 'dash',
    minDurationMs: 800,
    maxDurationMs: 1500,
    enter(pet) {
        const dir = Math.random() < 0.5 ? -1 : 1
        pet.targetVx = dir * pet.species.defaultSpeed * 5
        pet.targetVy = 0
    },
    update(pet, dt) {
        // hold the dash velocity; physics will smooth-stop at screen bounds
    },
    exit(pet) {
        pet.targetVx = 0
    },
})
```

### Step 2 — Register it (auto‑load)

Add the import to `client/src/modules/pets/engine/behaviors/index.ts`:

```ts
import './idle'
import './wander'
import './follow_cursor'
import './sleep'
import './dash'        // ← new line
```

`behaviors/index.ts` is imported once from `engine/PetEngine.ts` (or its module init), so every behavior self‑registers at app start.

### Step 3 — Reference it from a species

Update the species's `config.behaviorBag` and `config.animations`:

```jsonc
{
  "behaviorBag": ["idle", "wander", "dash"],
  "animations": {
    "idle":   { "frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 4 },
    "wander": { "frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 6 },
    "dash":   { "frameWidth": 64, "frameHeight": 64, "frames": 4, "fps": 12 }
  }
}
```

…and drop `dash.png` into `fastapi-server/pet_assets/<species_id>/dash.png`.

### Behavior contract — what you can and can't do

A behavior's `update(pet, dt)` runs every frame. **You set `targetVx` / `targetVy`** (and optionally `targetX` / `targetY` for following). Physics smooths the real `vx` / `vy` toward those targets and writes `x` / `y`. **Do not write `pet.x` directly** — you'll fight the physics step and look jittery. Exceptions: teleport behaviors that set `x` / `y` in `enter` and zero velocity.

Things behaviors can read:

| Field | Meaning |
|---|---|
| `pet.x`, `pet.y` | Current position (top‑left of sprite) |
| `pet.vx`, `pet.vy` | Current velocity (smoothed) |
| `pet.direction` | Facing (`1` right, `-1` left); auto‑updated by physics |
| `pet.species.defaultSpeed` | Speed knob |
| `pet.species.width`, `.height` | Hitbox |
| `pet.instanceId`, `pet.species.speciesId` | Identity (rarely needed in behaviors) |

Things to *not* write to:

- `pet.element` (managed by `PetSprite`)
- `pet.species.*` (read‑only — it's shared across all instances of that species)
- Anything starting with `_` (engine‑internal render state)

### Behavior lifecycle

```
chooseBehavior(pet)
  ├─ enter?(pet)           ← optional one-shot setup
  └─ loop until timer expires:
       └─ update(pet, dt)  ← called every frame
chooseBehavior(pet) again
  ├─ exit?(prev)           ← optional cleanup on old behavior
  ├─ enter?(next)
  └─ ...
```

Duration is randomised between `minDurationMs` and `maxDurationMs`. Defaults are 4000–7000ms if unset.

### Naming

Behavior ids are stored in DB JSON (`config.behaviorBag`). **Renaming a behavior breaks every species that references it.** If you must rename: add the new id alongside the old, update all `pet_species.config` rows, then remove the old id in a follow‑up.

---

## 3. Add a new lootbox SKU

```python
# in an Alembic data migration
op.execute(f"""
    INSERT INTO lootboxes (sku, display_name, price_points, drop_table, enabled)
    VALUES (
        'shadow',
        'Shadow Lootbox',
        500,
        '{json.dumps({
            "rarities": {
                "common": 0, "uncommon": 0, "rare": 60,
                "epic": 35, "legendary": 5
            },
            "speciesByRarity": {
                "rare":      ["shiba"],
                "epic":      ["shadow_fox"],
                "legendary": ["lava_slime"]
            },
            "pityAfterOpens": 20,
            "pityFloor": "epic"
        })}',
        true
    )
""")
```

Notes:

- **`rarities` weights are relative, not percentages.** `{rare: 60, epic: 35, legendary: 5}` and `{rare: 6, epic: 3.5, legendary: 0.5}` produce identical odds. The sum doesn't need to be 100.
- **Every rarity referenced in `speciesByRarity` must have a non‑zero weight in `rarities`**, otherwise it can never drop. The roll code in [`lootbox_roll.py`](../fastapi-server/app/services/lootbox_roll.py) skips zero‑weight rarities.
- **Every species in `speciesByRarity` must exist in `pet_species` with `enabled=true`.** A bad reference will surface as a `KeyError` when the user opens the box — write a guard test (§ Operational tests).
- `pityAfterOpens` + `pityFloor` are optional. Omit both to disable pity.
- To **disable** a lootbox, set `enabled=false`. It vanishes from `/lootboxes` and `/lootboxes/{sku}/open` returns 404. Existing audit rows are kept.

### Pricing

The current points economy: scores capped at 165, multiplied by a category factor (default 10) — see [points.py:36‑45](../fastapi-server/app/routes/points.py#L36-L45). One typing run yields ~50–1650 points. Calibrate lootbox prices against expected sessions‑per‑drop. Rough guide:

| Lootbox tier | Suggested price | ≈ runs to afford |
|---|---|---|
| Basic | 50 | 1 |
| Standard | 250 | ~5 |
| Premium / event | 500–1000 | ~10–20 |

---

## 4. Grant or revoke pets by hand

### Grant

```sql
INSERT INTO pet_instances (instance_id, user_id, species_id, source, active)
VALUES (gen_random_uuid(), 42, 'shadow_fox', 'grant:welcome_back', false);
```

On SQLite (the current backend), use a Python one‑shot instead of `gen_random_uuid()`:

```python
from app.database import SessionLocal
from app.crud.pets import create_instance

with SessionLocal() as db:
    create_instance(db, user_id=42, species_id='shadow_fox', source='grant:welcome_back')
```

`source` is free text — use it to track *why* a pet was granted (`grant:bug_compensation`, `grant:beta_tester`, `grant:event_2026_q1`). It shows up in audits and is invaluable when reconciling user reports.

### Revoke

```sql
DELETE FROM pet_instances WHERE user_id = 42 AND instance_id = '...';
```

Cascade is set up via `users.id ON DELETE CASCADE`, so deleting a user wipes their pets automatically.

### Reset a user's collection (be careful)

```sql
-- preview first!
SELECT instance_id, species_id, source FROM pet_instances WHERE user_id = 42;
DELETE FROM pet_instances WHERE user_id = 42;
```

`lootbox_opens` rows are kept — that's intentional, audit log.

---

## 5. Tune drop rates without a deploy

`lootboxes.drop_table` is JSON, so you can tweak weights live:

```sql
UPDATE lootboxes
SET drop_table = jsonb_set(
    drop_table::jsonb,
    '{rarities,legendary}',
    '2.0'::jsonb
)
WHERE sku = 'basic';
```

(SQLite: read the row, parse JSON, write it back from Python — easier than fighting `json_set` differences.)

**Always**:

1. Snapshot the previous `drop_table` before changing (paste it in a Slack thread or git commit message).
2. Add a one‑line entry to a `pet_drops_history.md` log so a year from now you know *when* drop rates changed.
3. Adjust during low‑traffic hours if you care about uniform odds across the player base.

### A/B testing drop rates

Create two SKUs with the same display name but different `drop_table`s, gate one behind a user attribute (e.g. `user_id % 2`). Easier and more honest than mutating a single SKU mid‑experiment.

---

## 6. Add a new animation state to an existing species

E.g. adding `"emote_heart"` to `cat`.

1. Drop the PNG: `fastapi-server/pet_assets/cat/emote_heart.png`.
2. Update the species `config`:
   ```jsonc
   {
     "behaviorBag": ["idle", "wander", "sleep", "emote_heart"],
     "animations": {
       ...existing...,
       "emote_heart": { "frameWidth": 64, "frameHeight": 64, "frames": 8, "fps": 12 }
     }
   }
   ```
3. Make sure `emote_heart` is a [registered behavior](#2-add-a-new-behavior).

If the behavior already exists for another species (e.g. you added `emote_heart` to `shadow_fox` last week), step 3 is already done. You only need the PNG + the `animations` entry + the `behaviorBag` slot.

**Why both `behaviorBag` and `animations` are required**: `behaviorBag` decides what the FSM picks; `animations` decides how the sprite sheet is sliced. Listing `emote_heart` in `behaviorBag` without an `animations` entry causes the engine to fail back to `idle` (no crash, but no animation either — silent bug).

---

## 7. Limited‑time and event pets

Two patterns:

### Pattern A — Time‑gated lootbox

Cleanest. Create a `lootboxes` row with `enabled=false`, flip it `true` during the event, flip back when it ends. Players who opened during the window keep their pets.

```sql
UPDATE lootboxes SET enabled = true  WHERE sku = 'event_xmas_2026';
-- run event
UPDATE lootboxes SET enabled = false WHERE sku = 'event_xmas_2026';
```

### Pattern B — Species rotated in/out of an existing box

Edit the `drop_table.speciesByRarity` to include the event species during the window, remove it after. The species stays in `pet_species` (don't delete — users still own it).

### Marking a species as event‑exclusive in the UI

Add a `tags` array to `config`:

```jsonc
{ "tags": ["event_2026_q1"], "behaviorBag": [...], ... }
```

The client can read `species.tags` from `/pets/species` and render a "Limited" badge. Not enforced server‑side — purely cosmetic.

---

## 8. Troubleshooting

### "I added a species but nothing shows up in the store"

1. Is it in a `lootboxes.drop_table.speciesByRarity` for an `enabled=true` lootbox? If not, it's an unobtainable orphan.
2. Is `pet_species.enabled = true`?
3. Hit `/pets/species` directly in DevTools → Network. Confirm it appears in the JSON. If not, the route filter is hiding it (likely `enabled=false`).

### "User opened a lootbox but the pet doesn't appear"

1. Check `lootbox_opens` — did the open actually succeed?
2. Check `pet_instances` for that `user_id` — was the instance created? (If yes, the bug is on the client refresh path.)
3. Client should refetch `/pets/inventory` after every open; verify in Network tab.
4. Active pets only show on screen when `pet_instances.active = true`. Owning ≠ showing.

### "Pet appears but doesn't animate / is just a static frame"

1. Open DevTools → Network → filter `pet-assets`. Is the sprite returning `403`?
   - `403 Asset link expired` → client URL is stale. Refetch `/pets/species`.
   - `403` with no detail → ownership check failed. Verify `pet_instances` has a row for `(user_id, species_id)`.
2. Is the behavior id in `pet.species.behaviorBag` actually [registered](#2-add-a-new-behavior)? Unregistered ids fall back to `idle` silently.
3. Does `config.animations` have an entry for the current behavior? Missing entries silently disable the frame stepper.

### "Pet appears in two places / duplicates on prod"

The Phase 1 fix in [pet.md §3](./pet.md#3-minimal-patch-to-make-the-current-pet-move-on-prod) de‑dupes `addPet` by id. If you see duplicates again after a refactor:
- Make sure the engine is a module‑level singleton, not per‑hook.
- Make sure `syncPets()` is being called (not `addPet` directly from React effects).

### "Lootbox open returned 500"

Almost always one of:
- `drop_table.speciesByRarity` references a `species_id` that doesn't exist in `pet_species`. Fix the JSON.
- Points debit succeeded but instance creation rolled back. Check server logs; the transaction wrapper in `/lootboxes/{sku}/open` should have rolled back the debit too, but verify the user wasn't charged.

### Operational tests to keep in CI

These catch ~90% of content authoring mistakes before they hit prod:

```python
def test_every_drop_table_references_existing_species(db):
    species_ids = {s.species_id for s in db.query(PetSpecies).all()}
    for box in db.query(Lootbox).filter_by(enabled=True):
        for rarity_pool in box.drop_table["speciesByRarity"].values():
            for sid in rarity_pool:
                assert sid in species_ids, f"{box.sku} references missing {sid}"

def test_every_species_animation_has_a_sprite_file(species_dir):
    for species in db.query(PetSpecies).filter_by(enabled=True):
        for behavior in species.config["animations"].keys():
            assert (species_dir / species.species_id / f"{behavior}.png").exists()

def test_every_behavior_in_bag_has_an_animation(db):
    for species in db.query(PetSpecies).filter_by(enabled=True):
        bag = set(species.config["behaviorBag"])
        anims = set(species.config["animations"].keys())
        missing = bag - anims
        assert not missing, f"{species.species_id} bag references {missing} with no animation"

def test_rarity_weights_cover_referenced_rarities(db):
    for box in db.query(Lootbox).filter_by(enabled=True):
        rarities = box.drop_table["rarities"]
        for rarity in box.drop_table["speciesByRarity"]:
            assert rarities.get(rarity, 0) > 0, f"{box.sku}: {rarity} pool exists but weight is zero"
```

A registered‑behavior check has to live in the client (Vitest):

```ts
test('every behavior referenced by any species is registered', async () => {
    await import('../engine/behaviors')   // forces self-registration
    const res = await fetch('/api/pets/species').then(r => r.json())
    const referenced = new Set<string>()
    for (const s of res.species) for (const b of s.behaviorBag) referenced.add(b)
    for (const id of referenced) expect(getBehavior(id)).toBeDefined()
})
```

---

## Quick reference: schemas

### `pet_species`

```python
species_id: str            # PK-ish, stable, snake_case
display_name: str          # UI
rarity: str                # common|uncommon|rare|epic|legendary
width: int                 # render box
height: int                # render box
default_speed_x100: int    # speed * 100
config: dict               # { behaviorBag, behaviorWeights?, animations, tags? }
enabled: bool              # hides from rolls + UI when false
```

### `pet_instances`

```python
instance_id: str (uuid)    # unique per pet a user owns
user_id: int (FK users)
species_id: str            # references pet_species.species_id
nickname: str | None
unlocked_at: datetime
active: bool               # is currently visible on screen
source: str                # "lootbox:basic", "grant:reason", etc.
```

### `lootboxes`

```python
sku: str                   # stable id ("basic", "shadow", "event_xmas_2026")
display_name: str
price_points: int
drop_table: dict           # { rarities, speciesByRarity, pityAfterOpens?, pityFloor? }
enabled: bool
```

### `lootbox_opens` (audit, append‑only)

```python
user_id, sku, rolled_rarity, rolled_species,
pet_instance_id (FK), cost_points, server_seed_hash, opened_at
```

---

## Cheat sheet

```
Add species          →  PNGs + 1 INSERT into pet_species  (no deploy)
Make it obtainable   →  UPDATE a lootbox's drop_table       (no deploy)
Add behavior         →  1 new file + 1 import line          (client deploy)
Add animation only   →  PNG + JSON edit on pet_species      (no deploy)
Tune drop rates      →  UPDATE lootboxes.drop_table         (no deploy)
Grant a pet          →  INSERT pet_instances                (no deploy)
Disable content      →  enabled = false                     (no deploy)
```

**The single load‑bearing invariant**: `species_id` and behavior ids are stable identifiers across DB JSON, sprite paths, and client code. Don't rename them — add new ones and migrate.
