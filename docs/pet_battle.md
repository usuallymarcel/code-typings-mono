# Pet Battle — a Super Auto Pets–style PvE auto-battler

Full design **and** implementation for adding pet battling to the game: a faithful
Super Auto Pets (SAP) style auto-battler where your lootbox pets form a team and
fight a scaling AI. Merge duplicates to level up, build an ordered 5-pet line, and
fight server-simulated, deterministic battles for points. Every code block below is
copy-paste-ready and written against the **actual** code on `feature/pets`.

> Companion docs: architecture & lootboxes live in [pet.md](./pet.md); the
> finish-the-implementation punch-list is [todo.md](./todo.md). This file is the
> battle layer and is self-contained.

> **Migrations:** per project convention this doc ships the SQLAlchemy **model code**
> only — no Alembic version files. New columns/tables are called out so you can
> `alembic revision --autogenerate` them.

## Table of contents

- [1. Overview, game loop & SAP mapping](#1-overview-game-loop--sap-mapping)
- [2. Server data model & CRUD](#2-server-data-model--crud)
- [3. Server battle engine (deterministic simulation)](#3-server-battle-engine-deterministic-simulation)
- [4. Server routes & economy integration](#4-server-routes--economy-integration)
- [5. Client types & data layer](#5-client-types--data-layer)
- [6. Client UI (arena playback, team builder, merge)](#6-client-ui-arena-playback-team-builder-merge)
- [7. Content, balance & tuning](#7-content-balance--tuning)

---

## 1. Overview, game loop & SAP mapping

### Pitch

This feature bolts a faithful, **Super Auto Pets–style PvE auto-battler** onto the existing pet/lootbox game. Players already roll pets out of lootboxes with points; now those pets become a deck. You **merge duplicates** of the same species to level them up, arrange up to **five** of them into an ordered battle line, and send that line into a **server-simulated clash** against a scaling AI team. The battle is resolved entirely on the server as a **deterministic, seeded simulation** that returns an ordered event log; the client just animates the replay. Winning earns points (the faucet) which you spend on more lootboxes (the sink), closing the economy loop — and pushes you up a **PvE trophy ladder** that makes the next enemy team tougher. There is no shop, no gold, no per-turn economy, no PvP, and no food beyond the merge-feed: one battle is one request, one transaction, one auditable result.

### End-to-end game loop

```text
        ┌──────────────────────────────────────────────────────────────┐
        │                                                              │
        ▼                                                              │
  ┌───────────────┐     points (spend)      ┌──────────────────────┐   │
  │  OPEN LOOTBOX │ ──────────────────────▶ │  GET A PET INSTANCE   │   │
  │  POST         │                         │  rarity-scaled stats  │   │
  │  /lootboxes/  │                         │  (baseAttack/Health   │   │
  │  {sku}/open   │                         │   from species.config)│   │
  └───────────────┘                         └──────────┬───────────┘   │
        ▲                                              │               │
        │                                              ▼               │
        │                               ┌──────────────────────────┐   │
        │                               │   MERGE DUPLICATES        │   │
        │                               │   POST /pets/merge        │   │
        │                               │   2 same-species → +1 xp  │   │
        │                               │   (xp≤5; lvl 1/2/3)       │   │
        │                               └──────────┬───────────────┘   │
        │                                          ▼                   │
        │                               ┌──────────────────────────┐   │
        │                               │   BUILD 5-PET TEAM        │   │
        │                               │   POST /battle/team       │   │
        │                               │   ordered, index0 = front │   │
        │                               └──────────┬───────────────┘   │
        │                                          ▼                   │
        │                          ┌───────────────────────────────┐   │
        │                          │   FIGHT THE SCALING AI        │   │
        │                          │   POST /battle/fight          │   │
        │                          │   server seeds + simulates    │   │
        │                          │   enemy scaled by trophies    │   │
        │                          │   → ordered BattleEvent[]     │   │
        │                          └──────────────┬────────────────┘   │
        │                                         ▼                    │
        │             win → trophies+1, streak+1      ┌─────────────┐  │
        │             loss → trophies-1, streak=0     │  EARN       │  │
        └─────────────────────────────────────────────│  POINTS     │──┘
                      reward added to User_Point       │  (faucet)   │
                      in the SAME transaction          └─────────────┘
```

### SAP → this game mapping

Every Super Auto Pets concept maps onto an existing or newly-added system in this codebase. The right column is the authoritative behavior; YAGNI cuts are called out explicitly.

| SAP concept | How THIS game does it |
| --- | --- |
| **Team line (up to 5, front = index 0)** | An ordered list of owned `instance_id`s persisted on `BattleProfile.team` (JSON), max 5. `index 0` is the FRONT. Saved via `POST /battle/team`, validated so every id is owned by the user. |
| **Clash / combat** | `battle_engine.simulate()` runs repeated simultaneous clashes between the two current fronts. Each front loses health equal to the opponent front's `attack`; a pet at `health <= 0` faints and the next pet steps forward. Both lines empty in one clash = draw. |
| **Abilities / triggers** | A bounded catalog of ~9 specials in `abilities.py`, keyed on the four triggers `start_of_battle`, `before_attack`, `on_hurt`, `on_faint`. Each species carries `config.special = { id, name, description, magnitude } | null`. Effective magnitude in battle = `magnitude * level`. Commons have `special = null`. |
| **Leveling (3 copies → lvl2, 6 → lvl3)** | `POST /pets/merge` feeds a same-species duplicate INTO a target: `+1 xp`, delete the sacrifice. `xp` capped at 5. `level = 1 if xp<2 else 2 if xp<5 else 3`. A target at `xp 5` (level 3) rejects the merge. Stats: `attack = baseAttack + xp`, `health = baseHealth + xp`. |
| **Arena trophies / ranked progression** | A PvE **trophy ladder** on `BattleProfile.trophies` (int ≥ 0). Win → `trophies += 1`; loss → `trophies = max(0, trophies - 1)`; draw → unchanged. `tier = trophies` drives all enemy scaling, so the ladder is the difficulty dial. |
| **Opponent teams** | Generated **deterministically** from `(tier, server_seed)` by `enemy.build_enemy_team()`: size `min(5, 1 + tier // 2)`, flat `+tier // 3` to each pet's attack and health, ability/level `min(3, 1 + tier // 4)`, rarity weighting shifting upward with tier. No stored opponent — purely derived and reproducible. |
| **Pack-fresh randomness / RNG** | A **seeded** RNG derived from a 32-byte server CSPRNG seed (`secrets.token_bytes(32)`), exactly like `app/utils/lootbox_roll.py`. `seed_hash = sha256(seed).hexdigest()` is persisted on `BattleLog` for auditing. |
| **Rewards / progression payout** | Battling is the points **faucet**: `win = min(300, 30 + tier*5 + streak*5)` (streak after increment), `draw = 10`, `loss = 0`, added to `User_Point` via the existing `update_user_points` CRUD inside the fight transaction. |
| **Shop / gold / turn economy** | **DROPPED (YAGNI).** Pets come from lootboxes, not a per-turn shop; there is no gold and no roll/freeze/buy phase. |
| **Food / consumables** | **DROPPED (YAGNI).** The only "feeding" is the merge-feed (`/pets/merge`). No food items. |
| **PvP / multiplayer / ranked matchmaking** | **DROPPED (YAGNI).** PvE only — every opponent is an AI team derived from your own trophy tier. One battle resolves in one request. |

### Why server-authoritative + deterministic

Battle outcomes move **points**, and points are the shared economy currency that buys lootboxes — so the client must never be trusted to decide who won or how much was earned. The simulation lives entirely on the server (`battle_engine.simulate()`), and `POST /battle/fight` performs the whole sequence — load team, build enemy, simulate, compute reward, add points, update profile, write the audit log — inside **one DB transaction**. The client receives an **ordered `BattleEvent[]`** plus the final `result`/`reward`/`trophiesAfter`, and only **replays** the animation; it has no path to alter the result.

This reuses the **existing lootbox security model** verbatim in spirit:

- **Same CSPRNG seed pattern.** `app/utils/lootbox_roll.py` already does `seed = secrets.token_bytes(32)` then `seed_hash = hashlib.sha256(seed).hexdigest()` and derives all "random" choices from the seed bytes. The battle engine does the same: every random choice (enemy species pick, any tie not already broken by the deterministic order) is drawn from an RNG seeded by those 32 bytes, so the full simulation is reproducible from `(tier, seed)`.
- **Same audit trail.** Just as lootbox rolls persist a row recording what was rolled, `POST /battle/fight` writes a `BattleLog` row carrying `seed_hash`, `tier`, `result`, and `reward`. Given the stored seed (or its hash for verification) the exact battle can be re-derived and audited.
- **Same auth + transaction discipline.** All `/battle/*` routes are session-gated via `get_session_from_request(db, request)` (raises 401), exactly like `/pets` and `/lootboxes`. Points are mutated through `update_user_points` (flush-only; the route owns the commit), identical to how `open_box` settles a roll.

Determinism is enforced inside the sim by resolving all simultaneous triggers in a fixed order — **current attack descending, ties broken by side (player before enemy), then by line index** — and by a hard clash guard (max 200 clashes) that falls back to "more total attack+health wins, else draw." This guarantees the simulation always terminates and that the same inputs always yield the same event log.

### Index-shift replay convention

Because this is referenced throughout the rest of the doc: every `index` in `faint`, `ability`, `summon`, and `Effect` events refers to the line position **at the moment that event is emitted**. When a front pet is removed, all pets behind it shift forward so the front is always index 0. The client MUST apply the same shift while replaying. When both fronts faint in the same clash, faints are emitted and applied in the deterministic order so indices never go stale.

### File manifest

Everything added or changed, server then client. Each row is one navigable unit covered by a later section of this doc.

| File | Add/Change | Role |
| --- | --- | --- |
| `fastapi-server/app/models/pet_instance.py` | **Change** | Add `level` (int, default 1, server_default `"1"`) and `xp` (int, default 0, server_default `"0"`) columns to `Pet_Instance`. |
| `fastapi-server/app/models/battle_profile.py` | **Add** | `BattleProfile` model: `user_id`, `trophies`, `wins`, `losses`, `streak`, `best_streak`, `team` (JSON list of instance_ids). |
| `fastapi-server/app/models/battle_log.py` | **Add** | `BattleLog` model: per-fight audit row with `user_id`, `tier`, `result`, `reward`, `seed_hash`, `created_at`. |
| `fastapi-server/app/utils/battle_engine.py` | **Add** | Deterministic `simulate(player_line, enemy_line, seed)` — clash loop, trigger ordering, event-log emission, termination guard. |
| `fastapi-server/app/utils/abilities.py` | **Add** | Bounded ~9-ability catalog (`pep_talk`, `splash_damage`, `adrenaline`, `snipe`, `recoil_blast`, `summon_token`, `jackpot`, `second_wind`, `guard_stance`) dispatched by trigger. |
| `fastapi-server/app/utils/enemy.py` | **Add** | `build_enemy_team(tier, rng, species)` — deterministic, trophy-scaled enemy line (size, flat bonus, level, rarity weighting). |
| `fastapi-server/app/crud/battle.py` | **Add** | CRUD: get-or-create `BattleProfile`, resolve saved team to instances, persist team, write `BattleLog`. |
| `fastapi-server/app/routes/battle.py` | **Add** | Battle router (`prefix="/battle"`): `GET /battle/profile`, `POST /battle/team`, `POST /battle/fight`. Session-gated; fight runs in one transaction. |
| `fastapi-server/app/routes/pets.py` | **Change** | Add `POST /pets/merge` (merge-to-level). Extend `/pets/inventory` items with `level` and `xp`. |
| `fastapi-server/app/main.py` | **Change** | `app.include_router(battle.router)`. |
| `client/src/modules/pets/models/pet.ts` | **Change** | Extend `PetInstance` with `level`/`xp`; extend `PetSpecies`/`SpeciesEntry` with `baseAttack`/`baseHealth`/`special: PetSpecial | null`. |
| `client/src/modules/pets/models/battle.ts` | **Add** | New battle types: `PetSnapshot`, `Effect`, `BattleEvent` union, `TeamPet`, `BattleProfile`, fight-response shapes. |
| `client/src/modules/pets/contexts/BattleContext.tsx` | **Add** | `BattleProvider` + `useBattleContext()` wrapping `useBattle` (profile, team, fight). |
| `client/src/modules/pets/hooks/useBattle.ts` | **Add** | Hook calling `/battle/*` endpoints with `credentials: "include"`; exposes profile, team, `saveTeam`, `fight`. |
| `client/src/modules/pets/components/BattleArena.tsx` | **Add** | Replays the server `BattleEvent[]` (start → abilities → clashes → faints/summons → end) with the index-shift convention. |
| `client/src/modules/pets/components/TeamBuilder.tsx` | **Add** | Drag/select up to 5 owned instances into an ordered line; persists via `POST /battle/team`. |
| `client/src/modules/pets/components/MergePanel.tsx` | **Add** | Pick a target + same-species sacrifice; calls `POST /pets/merge`; refreshes inventory. |
| `client/src/modules/pets/components/BattleLauncher.tsx` | **Add** | Fixed-position launcher button that `openModal()`s the battle/team/merge UI. |
| `client/src/App.tsx` | **Change** | Mount `<BattleLauncher />` (inside `BattleProvider`) next to `<Pets />`. |

---

## 2. Server data model & CRUD

This section adds the persistence layer for the auto-battler: two new columns on `Pet_Instance`, two new tables (`Battle_Profile`, `Battle_Log`), and the CRUD functions that the `/battle/*` and `/pets/merge` routes call. It follows the existing conventions exactly:

- SQLAlchemy 2.0 `Mapped` / `mapped_column` typing, `Base` from `app.database`.
- Python: 4-space indent, double quotes, type hints.
- **Transaction ownership (authoritative rule for this whole feature):** low-level mutators *flush only* (mirroring `update_user_points` and `create_instance`); the **route owns the transaction and commits once**. The two existing exceptions in the codebase that *do* commit internally (`set_active`, `create_points`) are isolated single-row helpers and are not part of the battle transaction. To stay consistent and avoid partial writes inside the one-request battle, **every** function below — including `merge_instances` — flushes only and documents "caller commits". The merge route owns its single `db.commit()`, exactly like the fight route does for the battle transaction. There is no function in this feature that commits internally.

### 2.0 Migrations (read this first)

**No Alembic migration file is provided** (per project policy — the user autogenerates migrations). Only the SQLAlchemy model code below is authoritative. After adding these files, run your usual `alembic revision --autogenerate` to produce the migration. The schema deltas the autogenerator must pick up are:

**New columns on existing table `pet_instances`:**
- `level` — `INTEGER NOT NULL DEFAULT 1` (`server_default="1"`)
- `xp` — `INTEGER NOT NULL DEFAULT 0` (`server_default="0"`)

**New table `battle_profiles`:**
- `id` PK, `user_id` (FK `users.id`, **unique**), `trophies`, `wins`, `losses`, `streak`, `best_streak` (all int, default 0), `team` (JSON, default `[]`), `updated_at` (timestamptz).

**New table `battle_logs`:**
- `id` PK, `user_id` (FK `users.id`), `result` (str), `reward` (int), `trophies_after` (int), `enemy_tier` (int), `seed_hash` (str), `created_at` (timestamptz).

The `server_default` values on the new `pet_instances` columns let the autogenerated migration backfill existing rows without a manual data step.

### 2.1 `Pet_Instance` — add `level` and `xp`

Full updated model file. The two new columns are appended; everything else is byte-for-byte the existing model. `Integer` is already imported.

```python
# fastapi-server/app/models/pet_instance.py
import uuid

from app.database import Base
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func

class Pet_Instance(Base):
    __tablename__ = "pet_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    instance_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    species_id: Mapped[str] = mapped_column(ForeignKey("pet_species.species_id"), index=True)

    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)

    unlocked_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())

    active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    source: Mapped[str] = mapped_column(String(32), nullable=True) #e.g lootbox

    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
```

> Note: `level` is stored for convenience/back-compat, but it is **derived from `xp`** by the authoritative formula `level = 1 if xp<2 else 2 if xp<5 else 3`. The merge CRUD below keeps the stored `level` in sync whenever it changes `xp`, so any reader can trust either field. The simulator (Section 4) computes `level` from `xp` directly and does not depend on the stored column.

### 2.2 `Battle_Profile` — new model

One row per user (the `user_id` FK is **unique**). `team` is a JSON list of `instance_id` strings (the uuid strings, ordered, front = index 0, max 5). Style mirrors `User_Point` (FK with `ondelete="CASCADE"`) and `Pet_Species` (JSON column).

```python
# fastapi-server/app/models/battle_profile.py
from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, func

class Battle_Profile(Base):
    __tablename__ = "battle_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True
    )

    trophies: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    losses: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    team: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
```

### 2.3 `Battle_Log` — new model (audit, mirrors `LootboxOpen`)

One row appended per resolved fight, for auditing/replay. The `seed_hash` is the sha256 hex of the server CSPRNG seed (Section 4), so a fight can be re-simulated and verified. Column shapes mirror `LootboxOpen` (`user_id` FK with `ondelete="CASCADE"`, short string codes, `created_at` timestamptz default). `enemy_tier` is **NOT nullable** and has no default — the fight route must populate it on every insert (see Section 4).

```python
# fastapi-server/app/models/battle_log.py
from sqlalchemy import DateTime, ForeignKey, Integer, String, func

from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column


class Battle_Log(Base):
    __tablename__ = "battle_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    result: Mapped[str] = mapped_column(String(8))

    reward: Mapped[int] = mapped_column(Integer)

    trophies_after: Mapped[int] = mapped_column(Integer)

    enemy_tier: Mapped[int] = mapped_column(Integer)

    seed_hash: Mapped[str] = mapped_column(String(64))

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

### 2.4 `app/crud/battle.py` — new CRUD

Functions used by the `/battle/*` routes.

**Transaction contract for this file:**
- `get_or_create_profile` — auto-creates the row if missing, exactly like `get_points_by_user_id` auto-creates points. It uses **`db.flush()` (not commit)** so the new row participates in the caller's transaction. This deliberately differs from `create_points` (which commits): the battle flow creates the profile and immediately mutates it in the same request, so committing mid-flow would split the unit of work. If a caller wants the profile persisted standalone (e.g. the read-only `GET /battle/profile`), it commits after calling this — documented at each call site in Section 5.
- `save_team` — flushes only; **caller commits**.
- `record_battle_result` — pure in-memory mutation of an already-attached `Battle_Profile` (no flush/commit); the route flushes/commits as part of the fight transaction.
- `write_battle_log` — `db.add` + `db.flush`; **caller commits**. It takes `enemy_tier` and writes it into the NOT-NULL `enemy_tier` column, so the route must always pass it.

```python
# fastapi-server/app/crud/battle.py
from sqlalchemy.orm import Session

from app.models.battle_profile import Battle_Profile
from app.models.battle_log import Battle_Log


def get_or_create_profile(db: Session, user_id: int) -> Battle_Profile:
    """
    Return the user's Battle_Profile, creating an empty one if it does not exist.

    Mirrors crud.user_points.get_points_by_user_id (auto-create on read), but
    FLUSHES instead of committing so the (possibly newly created) row is part of
    the caller's transaction. The caller owns the commit. Read-only routes that
    only need the profile may commit after calling this.
    """
    profile = db.query(Battle_Profile).filter(Battle_Profile.user_id == user_id).first()

    if not profile:
        profile = Battle_Profile(
            user_id=user_id,
            trophies=0,
            wins=0,
            losses=0,
            streak=0,
            best_streak=0,
            team=[]
        )
        db.add(profile)
        db.flush()
        db.refresh(profile)

    return profile


def save_team(db: Session, user_id: int, instance_ids: list[str]) -> Battle_Profile:
    """
    Overwrite the user's saved team with the given ordered list of instance_id
    strings (front = index 0, max 5). Ownership/length validation is done in the
    route before calling this. Flushes only; the CALLER commits.
    """
    profile = get_or_create_profile(db, user_id)
    profile.team = list(instance_ids)
    db.add(profile)
    db.flush()
    db.refresh(profile)

    return profile


def record_battle_result(db: Session, profile: Battle_Profile, result: str) -> Battle_Profile:
    """
    Apply the ladder progression rules to an already-attached Battle_Profile.

    Pure in-memory mutation per the SPEC ladder:
      win  -> trophies += 1; streak += 1; best_streak = max(best_streak, streak); wins += 1
      loss -> trophies = max(0, trophies - 1); streak = 0; losses += 1
      draw -> unchanged (counts as neither win nor loss)

    Does NOT flush or commit; the route flushes/commits the whole fight as one
    transaction. The `db` arg is accepted for signature symmetry / future use.
    """
    if result == "win":
        profile.trophies = profile.trophies + 1
        profile.streak = profile.streak + 1
        profile.best_streak = max(profile.best_streak, profile.streak)
        profile.wins = profile.wins + 1
    elif result == "loss":
        profile.trophies = max(0, profile.trophies - 1)
        profile.streak = 0
        profile.losses = profile.losses + 1
    # draw: trophies/streak/wins/losses all unchanged

    return profile


def write_battle_log(
    db: Session,
    user_id: int,
    result: str,
    reward: int,
    trophies_after: int,
    enemy_tier: int,
    seed_hash: str
) -> Battle_Log:
    """
    Append an audit row for a resolved fight. Flushes only; the CALLER commits
    (the row is part of the same fight transaction as the profile + points update).

    `enemy_tier` maps to the NOT-NULL enemy_tier column; the route must always
    pass it (it is the pre-fight tier == profile.trophies before the deltas).
    """
    log = Battle_Log(
        user_id=user_id,
        result=result,
        reward=reward,
        trophies_after=trophies_after,
        enemy_tier=enemy_tier,
        seed_hash=seed_hash
    )
    db.add(log)
    db.flush()
    db.refresh(log)

    return log
```

### 2.5 Additions to `app/crud/pets.py`

Two new functions are appended to the existing `pets.py`. Full updated file shown (existing functions unchanged):

- `get_instance_for_user` — ownership-scoped single fetch; returns `None` when the instance does not exist **or belongs to another user** (never leaks other users' pets).
- `merge_instances` — the **thin, flush-only** CRUD mutator. **Decision (stated explicitly, and consistent across the whole feature):** validation lives **in the route** (Section 4), exactly like `create_instance`/`update_user_points`; this function performs only the mutation and **flushes** so the route owns the single `db.commit()`. The route re-checks ownership/distinct/species/xp and maps any violation to a `400` before calling here. As a defensive guard against being called on missing rows, `merge_instances` still re-fetches both instances via user-scoped queries and returns early if either is `None`, but it does **not** duplicate the route's business validation. It keeps the stored `level` column in sync with `xp` using the authoritative formula.

```python
# fastapi-server/app/crud/pets.py
from sqlalchemy.orm import Session
from app.models.pet_instance import Pet_Instance

def list_user_instances(db: Session, user_id: int) -> list[Pet_Instance]:
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id).all()

def create_instance(db: Session, user_id: int, species_id: str, source: str) -> Pet_Instance:
    instance = Pet_Instance(user_id=user_id,
                            species_id=species_id,
                            source=source)
    db.add(instance)
    db.flush()
    db.refresh(instance)

    return instance

def set_active(db: Session, user_id: int, instance_id: str, active: bool):
    instance = db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id,
                                             Pet_Instance.instance_id == instance_id).first()
    
    instance.active = active
    db.commit()
    db.refresh(instance)
    return instance

def get_instance_for_user(db: Session, user_id: int, instance_id: str) -> Pet_Instance | None:
    """
    Fetch a single Pet_Instance by its public instance_id (uuid string), scoped
    to the owning user. Returns None if it does not exist or belongs to someone
    else, so callers can never act on another user's pet.
    """
    return db.query(Pet_Instance).filter(
        Pet_Instance.user_id == user_id,
        Pet_Instance.instance_id == instance_id
    ).first()

def _level_for_xp(xp: int) -> int:
    """Authoritative level curve: 1 if xp<2, 2 if xp<5, 3 if xp>=5 (xp in [0,5])."""
    if xp < 2:
        return 1
    if xp < 5:
        return 2
    return 3

def merge_instances(db: Session, user_id: int, target_id: str, sacrifice_id: str) -> Pet_Instance | None:
    """
    Feed `sacrifice_id` INTO `target_id` (SAP-style merge / level-up).

    THIN, FLUSH-ONLY mutator. The ROUTE (Section 4) owns all business validation
    (both owned, distinct, same species, target xp < 5) and maps violations to
    HTTP 400 BEFORE calling here, mirroring create_instance/update_user_points.

    This function only performs the mutation: re-fetch both instances via
    user-scoped queries as a defensive guard, return None early if either is
    missing, then target.xp += 1 (capped at 5), recompute target.level, and
    DELETE the sacrifice. FLUSHES only; the CALLER commits. Returns the updated
    target (or None if a row vanished between the route's check and here).
    """
    target = get_instance_for_user(db, user_id, target_id)
    sacrifice = get_instance_for_user(db, user_id, sacrifice_id)

    if target is None or sacrifice is None:
        return None

    target.xp = min(5, target.xp + 1)
    target.level = _level_for_xp(target.xp)

    db.delete(sacrifice)
    db.add(target)
    db.flush()
    db.refresh(target)

    return target
```

### 2.6 Who commits — summary table

| Function | Writes | Commits? | Notes |
|---|---|---|---|
| `crud.battle.get_or_create_profile` | insert (if new) | No — flush | Caller commits; matches `get_points_by_user_id` auto-create, but flush not commit |
| `crud.battle.save_team` | update `team` | No — flush | `POST /battle/team` route commits |
| `crud.battle.record_battle_result` | in-memory mutation | No | Route flushes/commits the fight txn |
| `crud.battle.write_battle_log` | insert | No — flush | Part of the fight txn; route commits; route must pass `enemy_tier` (NOT NULL) |
| `crud.pets.get_instance_for_user` | none (read) | n/a | Ownership-scoped, returns `None` for others |
| `crud.pets.merge_instances` | update + delete | No — flush | Route validates and owns the single `db.commit()`, like `create_instance` |

Every battle-feature mutator flushes only; **no function in this feature commits internally**. The `POST /battle/fight` route (Section 5) calls, in order, `get_or_create_profile` → simulate → `update_user_points` (existing, flush) → `record_battle_result` → `write_battle_log` (passing `enemy_tier=tier`, the pre-fight `profile.trophies`), then issues a **single `db.commit()`**, so the points award, profile update, and audit log all land atomically. The `POST /pets/merge` route likewise validates, calls the flush-only `merge_instances`, then issues its own single `db.commit()`.

---

## 3. Server battle engine (deterministic simulation)

The battle engine is the heart of the feature. Because real points are at stake, the simulation runs **entirely on the server** and is **deterministic**: given the same 32-byte server seed, the same player line, and the same enemy line, it always produces the identical ordered event log. The client never decides anything — it merely replays the events the server returns, exactly like the existing server-authoritative lootbox roll in `app/utils/lootbox_roll.py`.

To keep it auditable and unit-testable, the engine is built from **pure functions** that take plain dataclasses in and return plain event dicts out. **No code in this section touches the database.** The battle router (section 4) is the only place that reads/writes the DB; it passes the resolved species list and instances down into these helpers. This separation is what makes the sim trivially testable: you can construct `BattlePet` objects by hand, call `simulate(...)`, and assert on the event list.

**This engine is the single authority for the battle contract.** The route in section 4 conforms to the exact symbols and signatures exported here — there is no `new_seed`, `build_player_line`, `simulate_battle`, `SimResult`, or `pet_stats.py`. The route generates the seed inline (mirroring the lootbox util), builds the player line with a list comprehension over `build_battle_pet`, builds the enemy line with `build_enemy_team(tier, rng, all_species)`, and calls `simulate(player_line, enemy_line, rng)` which returns a **plain `list[dict]`** event log. The route derives the result from the final `end` event and reads the start snapshots from the first `start` event. The exact, authoritative call shape (copy it into the route verbatim) is:

```python
# In app/routes/battle.py — the ONLY supported way to drive the engine.
import hashlib
import secrets
from app.utils.battle_engine import make_rng, build_battle_pet, simulate, snapshot
from app.utils.battle_enemy import build_enemy_team, reward_for

seed = secrets.token_bytes(32)
seed_hash = hashlib.sha256(seed).hexdigest()
rng = make_rng(seed)

player_line = [
    build_battle_pet(inst, species_by_id[inst.species_id])
    for inst in team_instances
]
enemy_line = build_enemy_team(tier, rng, list(species_by_id.values()))

# simulate() mutates both lists in place, so snapshot the start frames first
# if the route needs them independent of events[0].
events = simulate(player_line, enemy_line, rng)
result = events[-1]["result"]
start_ev = events[0]
player_start = start_ev["player"]   # PetSnapshot[]
enemy_start = start_ev["enemy"]     # PetSnapshot[]
```

Three modules make up the engine:

- `app/utils/battle_engine.py` — the RNG, the `BattlePet` dataclass, the snapshot serializer, the builder that turns an `(instance, species)` pair into a `BattlePet`, and `simulate(...)` which runs the clash loop.
- `app/utils/battle_abilities.py` — the `ABILITY` registry and a small `AbilityCtx` so abilities can mutate state and emit `Effect`s.
- `app/utils/battle_enemy.py` — `build_enemy_team(...)` and `reward_for(...)`.

### 3.1 The index-shift convention (read this before the code)

This is the single most important invariant and the source of every potential off-by-one bug, so it is documented here and repeated in the code comments.

> **A line is a Python `list[BattlePet]`. Index `0` is always the FRONT. When a pet faints it is removed from the list, and every pet behind it shifts forward by one — so the next pet becomes the new index `0`.**

Every `index` that appears in an emitted event (`faint`, `summon`, `ability.sourceIndex`, and each `Effect.index`) refers to the pet's line position **at the instant that event is emitted**, against the list state at that moment. The client replays using the exact same shifting rule, so the indices always line up.

Consequences the code must respect:

- A `start_of_battle` / before-attack ordering is computed **once**, but abilities are applied one at a time; an ability's `sourceIndex` and its effect indices are read from the live lists right before it runs, so a pet that moved (e.g. via a summon ahead of it) still gets a correct index.
- Damage from a `start_of_battle` ability (`snipe`) or a `before_attack` ability (`recoil_blast`) can drive a **non-front** pet to `health <= 0`. After **every** ability phase that deals damage, we run a **full faint sweep over both lines** (not just the fronts) so a pre-killed back-line pet fires its `on_faint`, emits its `faint`/`summon` at its **live** index, and is removed **immediately** — it never reaches the front at full attack, and it never clashes against a corpse. See `resolve_faints` below.
- During a clash both fronts are at index `0` of their respective lines. After damage, we resolve faints **in a fixed order (player faints before enemy faints when both die in the same clash)** via the same `resolve_faints` sweep, which always emits each `faint` at the fainter's **live** index at emit time and removes it by identity.
- `summon`/`revive` from an `on_faint` ability happen **before** the corresponding removal, by mutating the fainter in place (revive via `second_wind`) or by inserting a token (summon via `summon_token`) — see the per-ability comments. The faint event for a revived pet is *not* emitted, and a summoned token is **inserted after the fainter** so the fainter's emitted index and the token's emitted index are always self-consistent (no `splice` ever hits the wrong tile).

### 3.2 `app/utils/battle_engine.py`

```python
# fastapi-server/app/utils/battle_engine.py
import random
from dataclasses import dataclass, field
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Seeded RNG
# ---------------------------------------------------------------------------
# The whole simulation is driven by a single random.Random seeded from the
# first 8 bytes of the server CSPRNG seed. Same seed bytes => same battle.
# Mirrors the lootbox roll: int.from_bytes(seed[:8], "big").
def make_rng(seed: bytes) -> random.Random:
    return random.Random(int.from_bytes(seed[:8], "big"))


# ---------------------------------------------------------------------------
# Stat formulas (authoritative; identical on client and server)
# ---------------------------------------------------------------------------
# attack(instance) = species.baseAttack + instance.xp
# health(instance) = species.baseHealth + instance.xp
# level(instance)  = 1 if xp<2 else 2 if xp<5 else 3   (xp in [0, 5])
def level_for_xp(xp: int) -> int:
    if xp < 2:
        return 1
    if xp < 5:
        return 2
    return 3


# ---------------------------------------------------------------------------
# BattlePet: the in-sim representation of one pet.
# ---------------------------------------------------------------------------
# This is intentionally a plain dataclass with no DB references so the engine
# stays pure and unit-testable. `health` mutates during the battle; max_health
# stays fixed (used by second_wind / snapshots). `special` is the resolved
# ability config dict {id, name, description, magnitude} or None for commons —
# note there is NO `trigger` key here; the trigger lives in the ABILITY
# registry and is looked up by id. `flags` carries per-battle one-shot state.
@dataclass
class BattlePet:
    instance_id: Optional[str]
    species_id: str
    display_name: str
    rarity: str
    attack: int
    health: int
    max_health: int
    level: int
    special: Optional[dict[str, Any]] = None
    flags: dict[str, bool] = field(default_factory=dict)
    is_token: bool = False

    @property
    def revived_used(self) -> bool:
        return self.flags.get("revived_used", False)

    @revived_used.setter
    def revived_used(self, value: bool) -> None:
        self.flags["revived_used"] = value


# ---------------------------------------------------------------------------
# Snapshot serialization (PetSnapshot in the SPEC event union).
# ---------------------------------------------------------------------------
# camelCase keys to match the client. The `special` field carries only the
# display-facing subset {id, name, description}; magnitude/trigger stay server
# side. isToken is omitted (falsy) for normal pets to keep snapshots lean.
# This PetSnapshot shape (with maxHealth, and isToken when truthy) is used for
# the `start`/`summon` event frames ONLY. The /battle/profile and /battle/team
# endpoints return the leaner TeamPet shape (see section 4's to_team_pet),
# which omits maxHealth and isToken.
def snapshot(pet: BattlePet) -> dict[str, Any]:
    special = None
    if pet.special is not None:
        special = {
            "id": pet.special["id"],
            "name": pet.special["name"],
            "description": pet.special["description"],
        }

    snap: dict[str, Any] = {
        "instanceId": pet.instance_id,
        "speciesId": pet.species_id,
        "displayName": pet.display_name,
        "rarity": pet.rarity,
        "attack": pet.attack,
        "health": pet.health,
        "maxHealth": pet.max_health,
        "level": pet.level,
        "special": special,
    }
    if pet.is_token:
        snap["isToken"] = True
    return snap


# ---------------------------------------------------------------------------
# Build a BattlePet from a saved instance + its species.
# ---------------------------------------------------------------------------
# `instance` is anything with .instance_id and .xp (a Pet_Instance, or a stub
# in tests). `species` is a Pet_Species (or stub) whose .config holds the
# battle stats injected in section 2: baseAttack, baseHealth, special.
# We read base stats out of config (the same dict spread into /pets/species),
# falling back to the rarity table so a half-migrated species never crashes.
RARITY_BASE = {
    "common": (2, 3),
    "uncommon": (3, 4),
    "rare": (4, 5),
    "epic": (5, 7),
    "legendary": (6, 9),
}


def _resolve_special(config: dict[str, Any], level: int) -> Optional[dict[str, Any]]:
    raw = config.get("special")
    if not raw:
        return None
    # The config `special` shape (section 7) is {id, name, description, tier,
    # magnitude} — there is NO `trigger` here. The trigger lives in the ABILITY
    # registry and is looked up by id at dispatch time, so we MUST NOT read
    # raw["trigger"] (it would KeyError on every ability pet). We carry only
    # the keys that actually exist; effective magnitude is computed in each
    # ability's apply() as magnitude * level, so we store the base magnitude.
    return {
        "id": raw["id"],
        "name": raw["name"],
        "description": raw["description"],
        "magnitude": raw["magnitude"],
    }


def build_battle_pet(instance: Any, species: Any) -> BattlePet:
    xp = int(getattr(instance, "xp", 0) or 0)
    level = level_for_xp(xp)

    config = species.config or {}
    fallback = RARITY_BASE.get(species.rarity, (2, 3))
    base_attack = int(config.get("baseAttack", fallback[0]))
    base_health = int(config.get("baseHealth", fallback[1]))

    attack = base_attack + xp
    health = base_health + xp

    return BattlePet(
        instance_id=instance.instance_id,
        species_id=species.species_id,
        display_name=species.display_name,
        rarity=species.rarity,
        attack=attack,
        health=health,
        max_health=health,
        level=level,
        special=_resolve_special(config, level),
        flags={},
        is_token=False,
    )


# ---------------------------------------------------------------------------
# Trigger lookup: the trigger is the registry's, NOT config's.
# ---------------------------------------------------------------------------
# `special` resolved by _resolve_special has no `trigger` key. We resolve the
# trigger by id from the ABILITY registry so config and engine never disagree.
def _trigger_of(special: Optional[dict[str, Any]]) -> Optional[str]:
    if special is None:
        return None
    from app.utils.battle_abilities import ABILITY
    entry = ABILITY.get(special["id"])
    return entry["trigger"] if entry is not None else None


# ---------------------------------------------------------------------------
# Ordering helper for simultaneous triggers.
# ---------------------------------------------------------------------------
# SPEC: by current attack DESC, ties broken by side (player before enemy),
# then by line index. side_rank: player=0, enemy=1. We snapshot (pet, side,
# index) tuples up front; abilities then re-read live indices when they run.
def _trigger_order(
    player: list[BattlePet], enemy: list[BattlePet]
) -> list[tuple[BattlePet, str]]:
    entries: list[tuple[int, int, int, BattlePet, str]] = []
    for index, pet in enumerate(player):
        entries.append((-pet.attack, 0, index, pet, "player"))
    for index, pet in enumerate(enemy):
        entries.append((-pet.attack, 1, index, pet, "enemy"))
    entries.sort(key=lambda e: (e[0], e[1], e[2]))
    return [(pet, side) for (_a, _s, _i, pet, side) in entries]


MAX_CLASHES = 200


# ---------------------------------------------------------------------------
# simulate: the deterministic battle.
# ---------------------------------------------------------------------------
# Pure: takes two lists of BattlePet and a seeded rng, returns the ordered
# event log (list of dicts matching the SPEC event union). Mutates the passed
# lists in place (caller hands ownership over). No DB, no I/O, no wall clock.
def simulate(
    player_pets: list[BattlePet],
    enemy_pets: list[BattlePet],
    rng: random.Random,
) -> list[dict[str, Any]]:
    # Imported here to avoid a circular import (abilities import this module
    # for AbilityCtx typing convenience in some setups).
    from app.utils.battle_abilities import ABILITY, AbilityCtx

    events: list[dict[str, Any]] = []

    # --- start event -------------------------------------------------------
    events.append({
        "type": "start",
        "player": [snapshot(p) for p in player_pets],
        "enemy": [snapshot(p) for p in enemy_pets],
    })

    # --- helper: run one ability and emit its event ------------------------
    def run_ability(pet: BattlePet, side: str) -> None:
        special = pet.special
        if special is None:
            return
        entry = ABILITY.get(special["id"])
        if entry is None:
            return
        line = player_pets if side == "player" else enemy_pets
        # Index is read LIVE: the pet may have shifted since ordering was
        # computed. If it's no longer on its line (e.g. removed) skip it.
        try:
            source_index = line.index(pet)
        except ValueError:
            return
        ctx = AbilityCtx(
            player=player_pets,
            enemy=enemy_pets,
            pet=pet,
            side=side,
            source_index=source_index,
            rng=rng,
        )
        effects = entry["apply"](ctx)
        event: dict[str, Any] = {
            "type": "ability",
            "side": side,
            "sourceIndex": source_index,
            "abilityId": special["id"],
            "abilityName": special["name"],
            "effects": effects,
        }
        if ctx.note is not None:
            event["note"] = ctx.note
        events.append(event)
        # An ability may have queued summons (summon_token) — flush them now so
        # the summon event follows its ability event.
        for summon_ev in ctx.summons:
            events.append(summon_ev)

    # --- faint sweep over BOTH lines (not just fronts) ---------------------
    # Damage from snipe (start_of_battle), recoil_blast (before_attack), or a
    # clash can leave ANY pet at health<=0 — including back-line pets. This
    # sweep is the single chokepoint for removing dead pets and firing on_faint
    # so a pre-killed pet never attacks at full strength and never clashes
    # against a corpse. It runs after start_of_battle, after before_attack, and
    # after each clash. It is order-stable and re-scans until no pet remains at
    # health<=0 (an on_faint summon could itself be at <=0, or splash_damage
    # could chain a kill onto a now-front pet).
    def resolve_faints() -> None:
        # Player faints resolve before enemy faints in the same pass (SPEC
        # removal order). Within a side, scan front-to-back so indices emitted
        # are the live positions at emit time.
        progressed = True
        while progressed:
            progressed = False
            for side in ("player", "enemy"):
                line = player_pets if side == "player" else enemy_pets
                idx = 0
                while idx < len(line):
                    pet = line[idx]
                    if pet.health > 0:
                        idx += 1
                        continue
                    # Fire on_faint. second_wind may revive this pet in place
                    # (health back > 0); summon_token inserts a token AFTER the
                    # fainter so the fainter keeps its index until removed.
                    if _trigger_of(pet.special) == "on_faint":
                        run_ability(pet, side)
                    # Revived in place -> stays, no faint event. Re-check from
                    # its current position (it may have shifted if a summon was
                    # inserted before scanning reached it — but summon inserts
                    # AFTER, so its index is unchanged).
                    if pet in line and pet.health > 0:
                        idx = line.index(pet) + 1
                        continue
                    # Truly fainted: emit faint at the fainter's LIVE index,
                    # then remove it by identity. Because summon_token inserts
                    # AFTER the fainter, line.index(pet) is exactly the tile the
                    # client must splice out — never the freshly summoned token.
                    if pet in line:
                        live_index = line.index(pet)
                        events.append({
                            "type": "faint", "side": side, "index": live_index,
                        })
                        line.remove(pet)
                        progressed = True
                    # Do not advance idx: the removal shifted everything behind
                    # forward, so re-inspect the same index next iteration.

    # --- start_of_battle abilities (deterministic order) -------------------
    for pet, side in _trigger_order(player_pets, enemy_pets):
        if _trigger_of(pet.special) == "start_of_battle":
            run_ability(pet, side)
    # snipe can pre-kill a back-line (or front) enemy: sweep BOTH lines now so
    # the dead pet is removed and its on_faint fires before any clash.
    resolve_faints()

    # --- clash loop with a hard guard so it always terminates --------------
    clashes = 0
    while player_pets and enemy_pets and clashes < MAX_CLASHES:
        clashes += 1

        pf = player_pets[0]
        ef = enemy_pets[0]

        # before_attack triggers for both fronts, ordered deterministically.
        for pet, side in _trigger_order([pf], [ef]):
            if _trigger_of(pet.special) == "before_attack":
                run_ability(pet, side)

        # recoil_blast (before_attack) hits the pet BEHIND the enemy front and
        # can drop it to <=0. Sweep BOTH lines so any such pet fires on_faint
        # and is removed BEFORE the clash — no free clash against a corpse, no
        # desynced client indices.
        resolve_faints()
        if not player_pets or not enemy_pets:
            break
        pf = player_pets[0]
        ef = enemy_pets[0]

        # Simultaneous damage: each front loses health = opponent front attack.
        player_damage = ef.attack
        enemy_damage = pf.attack

        # on_hurt for any front that took damage AND survives. We fire these
        # NOW (before appending the attack event), so the adrenaline `ability`
        # event precedes this clash's `attack` event in the log. adrenaline
        # only changes attack — never current health — so playerHealthAfter /
        # enemyHealthAfter are identical regardless of this ordering.
        pf.health -= player_damage
        ef.health -= enemy_damage

        hurt: list[tuple[BattlePet, str]] = []
        if player_damage > 0 and pf.health > 0:
            hurt.append((pf, "player"))
        if enemy_damage > 0 and ef.health > 0:
            hurt.append((ef, "enemy"))
        for pet, side in sorted(
            hurt, key=lambda h: (-h[0].attack, 0 if h[1] == "player" else 1)
        ):
            if _trigger_of(pet.special) == "on_hurt":
                run_ability(pet, side)

        # Attack event: one clash between the two current fronts. HealthAfter
        # reflects the damage (on_hurt changed attack, not health).
        events.append({
            "type": "attack",
            "playerDamage": player_damage,
            "enemyDamage": enemy_damage,
            "playerHealthAfter": pf.health,
            "enemyHealthAfter": ef.health,
        })

        # Resolve faints over BOTH lines, player-before-enemy, at live indices.
        resolve_faints()

    # --- end resolution ----------------------------------------------------
    if clashes >= MAX_CLASHES and player_pets and enemy_pets:
        # Guard tripped (pathological non-terminating board). Decide by total
        # remaining stats: more total (attack + health) wins; tie => draw.
        player_total = sum(p.attack + max(p.health, 0) for p in player_pets)
        enemy_total = sum(p.attack + max(p.health, 0) for p in enemy_pets)
        if player_total > enemy_total:
            result = "win"
        elif enemy_total > player_total:
            result = "loss"
        else:
            result = "draw"
    elif not player_pets and not enemy_pets:
        result = "draw"
    elif not player_pets:
        result = "loss"
    else:
        result = "win"

    events.append({"type": "end", "result": result})
    return events
```

`on_hurt` ordering is non-negotiable in exactly one direction: the code fires `on_hurt` (and appends its `ability` event) **before** appending the clash's `attack` event, so on replay the `adrenaline` buff event precedes the `attack` event. Because `adrenaline` mutates only **attack** and never current **health**, the `playerHealthAfter`/`enemyHealthAfter` in the `attack` event are byte-identical regardless of ordering — the placement is purely cosmetic and there is exactly one description of it (no "we emit after" alternative anywhere in this doc).

### 3.3 `app/utils/battle_abilities.py`

Each ability is `{ "trigger": ..., "apply": fn }`. The `apply(ctx)` mutates the live battle state through the `AbilityCtx` and returns a `list[Effect]` (the `effects` array of the `ability` event). Effective magnitude is always `magnitude * level`, computed once at the top of each `apply` via `ctx.magnitude()`. The functions are deliberately tiny and composable — all index lookups go through `ctx` so they respect the shift convention.

```python
# fastapi-server/app/utils/battle_abilities.py
import math
import random
from dataclasses import dataclass, field
from typing import Any

from app.utils.battle_engine import BattlePet, snapshot


# ---------------------------------------------------------------------------
# AbilityCtx: the only thing an ability is allowed to touch.
# ---------------------------------------------------------------------------
# Gives the ability both lines, the acting pet + its side, the seeded rng, an
# Effect collector, an optional note, and a summon queue (summon events the
# engine flushes right after the ability event). NO DB access.
@dataclass
class AbilityCtx:
    player: list[BattlePet]
    enemy: list[BattlePet]
    pet: BattlePet
    side: str
    source_index: int
    rng: random.Random
    note: str | None = None
    summons: list[dict[str, Any]] = field(default_factory=list)

    # --- line helpers --------------------------------------------------
    def own_line(self) -> list[BattlePet]:
        return self.player if self.side == "player" else self.enemy

    def enemy_line(self) -> list[BattlePet]:
        return self.enemy if self.side == "player" else self.player

    def enemy_side(self) -> str:
        return "enemy" if self.side == "player" else "player"

    def magnitude(self) -> int:
        # Effective magnitude = base magnitude * level.
        return int(self.pet.special["magnitude"]) * self.pet.level

    # --- Effect builders (index is read LIVE by the caller) ------------
    def effect(
        self, side: str, index: int, d_health: int = 0, d_attack: int = 0
    ) -> dict[str, Any]:
        eff: dict[str, Any] = {"side": side, "index": index}
        if d_health:
            eff["dHealth"] = d_health
        if d_attack:
            eff["dAttack"] = d_attack
        return eff


Effect = dict[str, Any]


# ---------------------------------------------------------------------------
# Helper: find the index of a pet on a line by identity (shift-safe).
# ---------------------------------------------------------------------------
def _index_of(line: list[BattlePet], pet: BattlePet) -> int:
    return line.index(pet)


# ---------------------------------------------------------------------------
# pep_talk (uncommon, start_of_battle):
# give the ally directly BEHIND this pet +m attack and +m health.
# ---------------------------------------------------------------------------
def _pep_talk(ctx: AbilityCtx) -> list[Effect]:
    m = ctx.magnitude()
    line = ctx.own_line()
    i = _index_of(line, ctx.pet)
    behind = i + 1
    if behind >= len(line):
        ctx.note = "no ally behind"
        return []
    ally = line[behind]
    ally.attack += m
    ally.health += m
    ally.max_health += m
    return [ctx.effect(ctx.side, behind, d_health=m, d_attack=m)]


# ---------------------------------------------------------------------------
# splash_damage (uncommon, on_faint):
# deal m damage to the current enemy front pet.
# ---------------------------------------------------------------------------
def _splash_damage(ctx: AbilityCtx) -> list[Effect]:
    m = ctx.magnitude()
    foes = ctx.enemy_line()
    if not foes:
        ctx.note = "no target"
        return []
    target = foes[0]
    target.health -= m
    return [ctx.effect(ctx.enemy_side(), 0, d_health=-m)]


# ---------------------------------------------------------------------------
# adrenaline (rare, on_hurt):
# permanently gain +m attack (for subsequent clashes). Fires each time it is
# hurt and survives.
# ---------------------------------------------------------------------------
def _adrenaline(ctx: AbilityCtx) -> list[Effect]:
    m = ctx.magnitude()
    line = ctx.own_line()
    i = _index_of(line, ctx.pet)
    ctx.pet.attack += m
    return [ctx.effect(ctx.side, i, d_attack=m)]


# ---------------------------------------------------------------------------
# snipe (rare, start_of_battle):
# deal 2*m damage to the enemy pet with the LOWEST current health
# (tie-break: frontmost). May drop a back-line enemy to <=0; the engine's
# post-start faint sweep removes it and fires its on_faint.
# ---------------------------------------------------------------------------
def _snipe(ctx: AbilityCtx) -> list[Effect]:
    m = ctx.magnitude()
    foes = ctx.enemy_line()
    if not foes:
        ctx.note = "no target"
        return []
    # min by (health, index): lowest health, frontmost on a tie.
    target_index = min(range(len(foes)), key=lambda j: (foes[j].health, j))
    dmg = 2 * m
    foes[target_index].health -= dmg
    return [ctx.effect(ctx.enemy_side(), target_index, d_health=-dmg)]


# ---------------------------------------------------------------------------
# recoil_blast (epic, before_attack):
# in addition to the normal attack, deal m splash damage to the enemy pet
# directly BEHIND the enemy front (if any). May drop that pet to <=0; the
# engine's post-before_attack faint sweep removes it and fires its on_faint.
# ---------------------------------------------------------------------------
def _recoil_blast(ctx: AbilityCtx) -> list[Effect]:
    m = ctx.magnitude()
    foes = ctx.enemy_line()
    if len(foes) < 2:
        ctx.note = "no pet behind enemy front"
        return []
    foes[1].health -= m
    return [ctx.effect(ctx.enemy_side(), 1, d_health=-m)]


# ---------------------------------------------------------------------------
# summon_token (epic, on_faint):
# summon a token pet with stats (2*level)/(2*level) into the fainter line at
# the fainter position. We INSERT the token at the fainter's index + 1 (i.e.
# directly BEHIND the still-present fainter). The engine then removes the
# fainter by identity at the fainter's live index; the token shifts forward by
# one and becomes the new front (or the new pet at the fainter's slot). This
# keeps the faint index and the summon index self-consistent: the faint event
# names the fainter's slot, the summon event names the token's slot at insert
# time, and neither ever points at the other's tile.
# ---------------------------------------------------------------------------
def _summon_token(ctx: AbilityCtx) -> list[Effect]:
    level = ctx.pet.level
    stat = 2 * level
    token = BattlePet(
        instance_id=None,
        species_id=ctx.pet.species_id,
        display_name="Token",
        rarity="common",
        attack=stat,
        health=stat,
        max_health=stat,
        level=1,
        special=None,
        flags={},
        is_token=True,
    )
    line = ctx.own_line()
    fainter_index = _index_of(line, ctx.pet)
    insert_at = fainter_index + 1
    line.insert(insert_at, token)
    ctx.summons.append({
        "type": "summon",
        "side": ctx.side,
        "index": insert_at,
        "pet": snapshot(token),
    })
    return []


# ---------------------------------------------------------------------------
# jackpot (legendary, start_of_battle):
# give ALL allies +m attack and +ceil(m/2) health.
# ---------------------------------------------------------------------------
def _jackpot(ctx: AbilityCtx) -> list[Effect]:
    m = ctx.magnitude()
    d_health = math.ceil(m / 2)
    line = ctx.own_line()
    effects: list[Effect] = []
    for i, ally in enumerate(line):
        ally.attack += m
        ally.health += d_health
        ally.max_health += d_health
        effects.append(ctx.effect(ctx.side, i, d_health=d_health, d_attack=m))
    return effects


# ---------------------------------------------------------------------------
# second_wind (legendary, on_faint):
# the FIRST time this pet would faint, instead revive it at ceil(maxHealth/2)
# health (once per battle). Revive IN PLACE: set health back above 0 so the
# engine's faint sweep sees this pet with health > 0 and does NOT emit a faint
# / does NOT remove it.
# ---------------------------------------------------------------------------
def _second_wind(ctx: AbilityCtx) -> list[Effect]:
    if ctx.pet.revived_used:
        return []
    ctx.pet.revived_used = True
    revived = math.ceil(ctx.pet.max_health / 2)
    line = ctx.own_line()
    i = _index_of(line, ctx.pet)
    # dHealth is the delta from the (negative/zero) current health back up to
    # the revive value, so the client animates a correct heal.
    delta = revived - ctx.pet.health
    ctx.pet.health = revived
    ctx.note = "revived"
    return [ctx.effect(ctx.side, i, d_health=delta)]


# ---------------------------------------------------------------------------
# guard_stance (epic, start_of_battle):
# give the FRONT pet of its own line +m health (tank flavor: a benched guard
# reinforces the real front line, which is what takes the clash). Targets
# index 0 always; if this pet IS the front, it buffs itself.
# ---------------------------------------------------------------------------
def _guard_stance(ctx: AbilityCtx) -> list[Effect]:
    m = ctx.magnitude()
    line = ctx.own_line()
    if not line:
        ctx.note = "no front"
        return []
    front = line[0]
    front.health += m
    front.max_health += m
    return [ctx.effect(ctx.side, 0, d_health=m)]


# ---------------------------------------------------------------------------
# Registry keyed by ability id. trigger must match the SPEC catalog exactly.
# This registry is the SOLE source of an ability's trigger — config does NOT
# carry `trigger`; the engine looks it up here by id (see _trigger_of).
# ---------------------------------------------------------------------------
ABILITY: dict[str, dict[str, Any]] = {
    "pep_talk": {"trigger": "start_of_battle", "apply": _pep_talk},
    "splash_damage": {"trigger": "on_faint", "apply": _splash_damage},
    "adrenaline": {"trigger": "on_hurt", "apply": _adrenaline},
    "snipe": {"trigger": "start_of_battle", "apply": _snipe},
    "recoil_blast": {"trigger": "before_attack", "apply": _recoil_blast},
    "summon_token": {"trigger": "on_faint", "apply": _summon_token},
    "jackpot": {"trigger": "start_of_battle", "apply": _jackpot},
    "second_wind": {"trigger": "on_faint", "apply": _second_wind},
    "guard_stance": {"trigger": "start_of_battle", "apply": _guard_stance},
}
```

A subtle correctness point worth calling out: `summon_token` and `second_wind` are both `on_faint` abilities, and the engine's `resolve_faints` sweep calls the ability **before** deciding whether to remove the fainter.

- `second_wind` sets `health` back above `0` *in place*. After the ability returns, the sweep sees the pet still on its line with `health > 0` → it stays, and **no `faint` event** is emitted. Exactly once per battle (guarded by `revived_used`).
- `summon_token` inserts the token **directly behind** the fainter (`fainter_index + 1`). After the ability returns, the sweep emits the fainter's `faint` at its **live** index and then removes it **by identity** — never `pop(0)`. Removing the fainter shifts the token forward into the fainter's slot, so the token becomes the new occupant of that position. Because the summon event named `fainter_index + 1` at insert time and the faint event names the fainter's own slot, the two indices are always self-consistent: a client that `splice`s the faint index removes the fainter, and the previously-inserted summon tile is exactly the pet that slides into place. The `summon` event is flushed by `run_ability` immediately after the `ability` event and *before* the `faint` event, matching the SPEC ordering.

### 3.4 `app/utils/battle_enemy.py`

`build_enemy_team` is deterministic given `(tier, rng, all_species)` — **tier first, then the seeded `random.Random`, then the species list** (this is the exact order the route in section 4 must call it with; it never receives raw seed bytes). It applies the SPEC scaling: team size, flat stat bonus, level, and rarity weighting that shifts toward higher rarity as the tier grows. `reward_for` implements the reward formula. Both are pure — the route supplies `all_species` from `get_pet_species(db)`.

```python
# fastapi-server/app/utils/battle_enemy.py
import random
from typing import Any

from app.utils.battle_engine import (
    RARITY_BASE,
    BattlePet,
    _resolve_special,
)

RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"]


# ---------------------------------------------------------------------------
# Rarity weighting per tier.
# ---------------------------------------------------------------------------
# Low tiers lean common/uncommon; as the tier climbs the weight mass slides
# toward rarer pets. We compute an integer "pressure" = tier and weight each
# rarity by a curve that increases for higher rarities as pressure grows.
# Fully deterministic: only depends on tier (the rng picks WITHIN the weights).
def _rarity_weights(tier: int) -> dict[str, float]:
    weights: dict[str, float] = {}
    for rank, rarity in enumerate(RARITY_ORDER):
        # Base mass favors low rarity; tier shifts mass up the ladder.
        # rank 0 (common) starts high and decays with tier; high ranks grow.
        base = max(0.0, 6.0 - 2.0 * rank)
        growth = rank * (tier / 4.0)
        weights[rarity] = base + growth
    # Guarantee every rarity has a tiny floor so high-tier teams can still
    # occasionally roll a common and the distribution never collapses to 0.
    for rarity in RARITY_ORDER:
        weights[rarity] += 0.1
    return weights


def _weighted_pick_rarity(rng: random.Random, weights: dict[str, float]) -> str:
    total = sum(weights.values())
    r = rng.random() * total
    acc = 0.0
    for rarity in RARITY_ORDER:
        acc += weights[rarity]
        if r <= acc:
            return rarity
    return RARITY_ORDER[0]


# ---------------------------------------------------------------------------
# build_enemy_team(tier, rng, all_species) -> list[BattlePet]
# ---------------------------------------------------------------------------
# SPEC scaling:
#   size       = min(5, 1 + tier // 2)
#   stat bonus = tier // 3   (added to BOTH attack and health of each pet)
#   level      = min(3, 1 + tier // 4)   (drives ability magnitude + a
#                stat bump equal to the level-implied xp, like a merged pet)
#   rarity     = weighted toward higher rarity as tier grows (seeded rng)
# all_species is the full enabled roster (list of Pet_Species-like objects).
# rng MUST be a random.Random (the same instance driving the rest of the sim),
# NOT raw seed bytes — passing bytes here is a TypeError.
def build_enemy_team(
    tier: int, rng: random.Random, all_species: list[Any]
) -> list[BattlePet]:
    size = min(5, 1 + tier // 2)
    stat_bonus = tier // 3
    level = min(3, 1 + tier // 4)
    # An enemy of `level` is treated like a merged pet: its implied xp is the
    # lowest xp that yields that level, so stats track the leveling formula.
    implied_xp = 0 if level == 1 else 2 if level == 2 else 5

    # Bucket the roster by rarity once.
    by_rarity: dict[str, list[Any]] = {r: [] for r in RARITY_ORDER}
    for s in all_species:
        if s.rarity in by_rarity:
            by_rarity[s.rarity].append(s)

    weights = _rarity_weights(tier)

    team: list[BattlePet] = []
    for _ in range(size):
        rarity = _weighted_pick_rarity(rng, weights)
        # If the chosen rarity bucket is empty, walk DOWN to a populated one so
        # we never crash on a roster that lacks, say, legendaries.
        pool = by_rarity.get(rarity, [])
        if not pool:
            for fallback in reversed(RARITY_ORDER[: RARITY_ORDER.index(rarity) + 1]):
                if by_rarity.get(fallback):
                    pool = by_rarity[fallback]
                    break
        if not pool:
            # Roster is completely empty for everything at/below this rarity;
            # try anything that exists.
            for r in RARITY_ORDER:
                if by_rarity.get(r):
                    pool = by_rarity[r]
                    break
        if not pool:
            continue  # truly empty roster; produce a smaller team

        species = pool[rng.randrange(len(pool))]

        config = species.config or {}
        fallback_stats = RARITY_BASE.get(species.rarity, (2, 3))
        base_attack = int(config.get("baseAttack", fallback_stats[0]))
        base_health = int(config.get("baseHealth", fallback_stats[1]))

        attack = base_attack + implied_xp + stat_bonus
        health = base_health + implied_xp + stat_bonus

        team.append(BattlePet(
            instance_id=None,
            species_id=species.species_id,
            display_name=species.display_name,
            rarity=species.rarity,
            attack=attack,
            health=health,
            max_health=health,
            level=level,
            special=_resolve_special(config, level),
            flags={},
            is_token=False,
        ))

    return team


# ---------------------------------------------------------------------------
# reward_for(result, tier, streak_after) -> int
# ---------------------------------------------------------------------------
# SPEC reward formula (streak_after is the streak AFTER incrementing on a win):
#   win:  min(300, 30 + tier*5 + streak*5)
#   draw: 10
#   loss: 0
def reward_for(result: str, tier: int, streak_after: int) -> int:
    if result == "win":
        return min(300, 30 + tier * 5 + streak_after * 5)
    if result == "draw":
        return 10
    return 0
```

### 3.5 Determinism & termination guarantees

- **Single seed source.** `make_rng(seed)` is the only randomness in the engine; `build_enemy_team` and every ability draw from that same `random.Random`. The route persists `seed_hash = sha256(seed).hexdigest()` on the battle log row for auditing (section 4), exactly as the lootbox roll does.
- **Stable ordering everywhere.** All simultaneous triggers go through `_trigger_order` (attack desc → side → index). No reliance on dict/set iteration order for outcomes.
- **One faint chokepoint.** `resolve_faints()` is the only place a pet is removed. It runs after `start_of_battle`, after `before_attack`, and after each clash, scanning **both lines front-to-back** (player before enemy) so a non-front pet killed by `snipe`/`recoil_blast` fires its `on_faint`, emits its `faint`/`summon` at its live index, and is removed before it can clash. This keeps client/server index replay in lockstep.
- **Guaranteed termination.** Every clash either deals damage (both fronts lose `opponent.attack` health) or, in the degenerate `0`-attack stalemate, is bounded by `MAX_CLASHES = 200`; if the guard trips, the `end` result is decided by total remaining `attack + health` (tie → `draw`). The loop variable `clashes` strictly increments, so `simulate` always returns. The inner `resolve_faints` sweep terminates because each pass either removes at least one pet (strictly shrinking the lines) or makes no progress and stops.
- **No DB, no clock, no global state.** `BattlePet`, `simulate`, `build_enemy_team`, and `reward_for` are pure functions over their arguments, so a unit test can construct pets, pass a `random.Random(0)`, and assert the exact event list.

These three modules are imported by the battle router in section 4, which is the only layer that resolves instances/species from the database and wraps the whole thing (simulate → `reward_for` → points credit → profile/log write) in one transaction.

---

## 4. Server routes & economy integration

This section wires the deterministic engine (section 3) and the new persistence models (section 2) into HTTP. Three pieces:

- **`app/routes/battle.py`** — a brand-new router mounted at prefix `/battle` with `GET /battle/profile`, `POST /battle/team`, and `POST /battle/fight`.
- **`app/routes/pets.py`** — the existing pets router gains `POST /pets/merge` (leveling-via-feed).
- **`app/main.py`** — one import line and one `include_router` line.

Every route is session-gated through `get_session_from_request(db, request)` (raises 401 itself, so we never check auth manually). The fight and merge routes own their transaction and mirror the lootbox `open_box` route *exactly*: a `try` body that ends with `db.commit()`, an `except HTTPException: db.rollback(); raise` clause that lets validation errors (400/404) propagate unchanged, and a catch-all `except Exception:` that rolls back and raises a generic 500. This is the contract that lets us safely call `update_user_points` (which only flushes) and `create_instance`/`merge_instances` (which only flush) and still guarantee atomicity: the route is the only thing that commits.

### 4.0 Symbols this section depends on

These are defined in earlier sections; this section only *calls* them. Listed here so the route code below is unambiguous, with the **exact** names and signatures the engine (section 3) ships.

- **Engine (section 3, `app/utils/battle_engine.py`):**
  - `make_rng(seed: bytes) -> random.Random` — a deterministic `random.Random` seeded from the CSPRNG seed bytes.
  - `build_battle_pet(instance, species) -> BattlePet` — turns ONE ordered `Pet_Instance` row + its `Pet_Species` into an engine pet using the stat formulas. There is no whole-line builder; the route maps it over the team.
  - `build_enemy_team(tier, rng, all_species) -> list[BattlePet]` — deterministic from `(tier, rng)`; arg order is **tier first, then the `random.Random`, then the species list** (never raw seed bytes).
  - `simulate(player_pets, enemy_pets, rng) -> list[dict]` — returns the bare ordered `events` list (camelCase `BattleEvent[]`). It MUTATES the two line lists in place. The first element is the `start` event carrying `player`/`enemy` snapshot arrays; the last element is the `end` event carrying `result`.
  - `snapshot(pet) -> dict` — one camelCase `PetSnapshot` for an engine pet (emits `maxHealth`, and `isToken` only when truthy).
  - `level_for_xp(xp) -> int` — `1 if xp<2 else 2 if xp<5 else 3`.
  - `species_special(species, level) -> dict | None` — projects `species.config["special"]` to `{ "id", "name", "description" }` at the given level, or `None` for commons. (A thin wrapper over the engine's `_resolve_special`, kept in `battle_engine.py` so there is a single source.)
  - `reward_for(result, tier, streak_after) -> int` — the authoritative reward formula (`win: min(300, 30 + tier*5 + streak_after*5)`, `draw: 10`, `loss: 0`).
  - `RARITY_BASE: dict[str, tuple[int, int]]` — the `(baseAttack, baseHealth)` defaults per rarity, used as the fallback when a species omits its `config` overrides.
- **Persistence (section 2):**
  - Model `app.models.battle_profile.Battle_Profile` (cols: `user_id` PK/FK, `trophies`, `wins`, `losses`, `streak`, `best_streak`, `team` JSON list of `instance_id` strings).
  - Model `app.models.battle_log.Battle_Log` (cols: `id`, `user_id`, `result`, `reward`, `trophies_after`, `enemy_tier`, `seed_hash`, `created_at`). Note `enemy_tier` is `Mapped[int]` and **NOT NULL** — the fight route must populate it.
  - CRUD `app.crud.battle.get_or_create_profile(db, user_id) -> Battle_Profile` (auto-creates with `team=[]`, all counters 0; flush only, no commit), `save_team(db, user_id, team) -> Battle_Profile` (sets `profile.team`, flush only), and `record_battle_result(db, profile, result) -> None` (applies the trophy/streak/win-loss deltas in-place per the ladder rules; flush only — the route commits).
  - CRUD `app.crud.pets.merge_instances(db, user_id, target_instance_id, sacrifice_instance_id) -> Pet_Instance` (flush only; the route owns validation and the commit — see 4.2).

### 4.1 `app/routes/battle.py`

The route module owns: resolving the saved team to instances (dropping ids the user no longer owns), the `to_team_pet` helper used by the resolved-team endpoints, and the fight transaction. The species lookup is built **once per request** as a `dict` keyed by `species_id` from `get_pet_species(db)`.

`to_team_pet` deliberately emits the leaner **`TeamPet`** shape (no `maxHealth`, no `isToken`) so `/battle/profile` and `/battle/team` match the client `TeamPet` type. The fuller `PetSnapshot` shape (with `maxHealth`/`isToken`) is produced only by the engine's `snapshot()` inside the `start` event, which is where `playerTeam`/`enemyTeam` come from.

```python
# fastapi-server/app/routes/battle.py
import hashlib
import secrets

from pydantic import BaseModel

from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import list_user_instances
from app.crud.pet_species import get_pet_species
from app.crud.user_points import get_points_by_user_id, update_user_points
from app.crud.battle import get_or_create_profile, save_team, record_battle_result
from app.utils.battle_engine import (
    make_rng,
    build_battle_pet,
    build_enemy_team,
    simulate,
    level_for_xp,
    species_special,
    reward_for,
    RARITY_BASE,
)
from app.models.battle_log import Battle_Log


router = APIRouter(prefix="/battle", tags=["battle"])


def species_lookup(db) -> dict:
    """species_id -> Pet_Species for every enabled species, built once per request."""
    return {s.species_id: s for s in get_pet_species(db)}


def to_team_pet(instance, species) -> dict:
    """Resolve one owned Pet_Instance + its Pet_Species into the leaner TeamPet
    shape used by /battle/profile and /battle/team.

    This intentionally omits maxHealth and isToken (those belong to the fuller
    PetSnapshot the engine emits in the battle start frame). Stats are derived
    from xp via the authoritative formulas: attack = baseAttack + xp,
    health = baseHealth + xp, with the RARITY_BASE defaults as fallback.
    """
    xp = instance.xp
    level = level_for_xp(xp)
    base_attack, base_health = RARITY_BASE.get(species.rarity, (2, 3))
    config = species.config or {}
    attack = int(config.get("baseAttack", base_attack)) + xp
    health = int(config.get("baseHealth", base_health)) + xp
    return {
        "instanceId": instance.instance_id,
        "speciesId": species.species_id,
        "displayName": species.display_name,
        "rarity": species.rarity,
        "attack": attack,
        "health": health,
        "level": level,
        "special": species_special(species, level),
    }


def resolve_team(db, user_id: int, species_by_id: dict) -> tuple[list, list[dict]]:
    """Load the saved team, drop ids the user no longer owns or whose species is
    disabled/missing, and return (ordered_instances, ordered_team_pets).

    The pruned ordering is what gets persisted back so stale ids self-heal.
    """
    profile = get_or_create_profile(db, user_id)

    instances_by_id = {i.instance_id: i for i in list_user_instances(db, user_id)}

    ordered_instances = []
    team_pets = []
    pruned_team = []

    for instance_id in profile.team:
        instance = instances_by_id.get(instance_id)
        if instance is None:
            continue
        species = species_by_id.get(instance.species_id)
        if species is None:
            continue
        ordered_instances.append(instance)
        team_pets.append(to_team_pet(instance, species))
        pruned_team.append(instance_id)

    if pruned_team != profile.team:
        save_team(db, user_id, pruned_team)
        db.commit()

    return ordered_instances, team_pets


def profile_payload(profile) -> dict:
    return {
        "trophies": profile.trophies,
        "wins": profile.wins,
        "losses": profile.losses,
        "streak": profile.streak,
        "bestStreak": profile.best_streak,
    }


@router.get("/profile")
def get_profile(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    species_by_id = species_lookup(db)
    profile = get_or_create_profile(db, session.user_id)

    _, team = resolve_team(db, session.user_id, species_by_id)

    return {
        "ok": True,
        "profile": profile_payload(profile),
        "team": team,
    }


class TeamBody(BaseModel):
    team: list[str]


@router.post("/team")
def set_team(body: TeamBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    if len(body.team) > 5:
        raise HTTPException(400, "team may contain at most 5 pets")

    owned_ids = {i.instance_id for i in list_user_instances(db, session.user_id)}

    seen = set()
    cleaned = []
    for instance_id in body.team:
        if instance_id not in owned_ids:
            raise HTTPException(400, "team contains a pet you do not own")
        if instance_id in seen:
            raise HTTPException(400, "team contains a duplicate pet")
        seen.add(instance_id)
        cleaned.append(instance_id)

    try:
        save_team(db, session.user_id, cleaned)
        db.commit()
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not save team")

    species_by_id = species_lookup(db)
    profile = get_or_create_profile(db, session.user_id)
    _, team = resolve_team(db, session.user_id, species_by_id)

    return {
        "ok": True,
        "profile": profile_payload(profile),
        "team": team,
    }


@router.post("/fight")
def fight(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    species_by_id = species_lookup(db)

    profile = get_or_create_profile(db, session.user_id)
    team_instances, _ = resolve_team(db, session.user_id, species_by_id)

    if not team_instances:
        # resolve_team / get_or_create_profile may have flushed a freshly-created
        # empty profile; roll it back so the 400 path leaves nothing dangling
        # (the profile is re-created on the next real call anyway).
        db.rollback()
        raise HTTPException(400, "you have no pets in your battle team")

    tier = profile.trophies

    try:
        # Seed inline, mirroring lootbox_roll.py: 32 CSPRNG bytes + sha256 hex.
        seed = secrets.token_bytes(32)
        seed_hash = hashlib.sha256(seed).hexdigest()
        rng = make_rng(seed)

        player_line = [
            build_battle_pet(inst, species_by_id[inst.species_id])
            for inst in team_instances
        ]
        enemy_line = build_enemy_team(tier, rng, list(species_by_id.values()))

        # simulate() returns the bare events list and MUTATES the lines in place.
        # The start frame (events[0]) holds the start-of-battle snapshots; the end
        # frame (events[-1]) holds the result.
        events = simulate(player_line, enemy_line, rng)
        start_ev = events[0]
        player_start = start_ev["player"]
        enemy_start = start_ev["enemy"]
        result = events[-1]["result"]

        # Apply the ladder deltas FIRST so streak/trophies reflect this battle,
        # then read them back for the reward (streak AFTER incrementing).
        record_battle_result(db, profile, result)
        reward = reward_for(result, tier, profile.streak)

        pts = get_points_by_user_id(db, session.user_id)
        points_remaining = pts.points + reward
        update_user_points(db, session.user_id, points_remaining)

        db.add(Battle_Log(
            user_id=session.user_id,
            result=result,
            reward=reward,
            trophies_after=profile.trophies,
            enemy_tier=tier,
            seed_hash=seed_hash,
        ))

        db.commit()
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not resolve battle")

    return {
        "ok": True,
        "result": result,
        "reward": reward,
        "trophiesAfter": profile.trophies,
        "streakAfter": profile.streak,
        "pointsRemaining": points_remaining,
        "playerTeam": player_start,
        "enemyTeam": enemy_start,
        "events": events,
    }
```

**Index/shifting convention (must match the client replay):** `player_start` and `enemy_start` (the `start` event's `player`/`enemy` arrays) are the snapshots at battle start (front = index 0). Every `index`/`sourceIndex` inside `events` refers to the line position **at the moment that event is emitted**; the engine emits `faint`/`summon`/`ability` against the live line after prior removals in the same clash, so the client must apply the same forward-shift when it replays. This is the single source of truth for both sides because both consume `events`.

**Transaction note on `resolve_team`:** the self-healing `save_team` + `db.commit()` inside `resolve_team` runs *before* the fight's own `try` block opens (we call `resolve_team` prior to `try`), so it never interleaves with the reward transaction. Pruning stale ids is an idempotent, side-effect-only write; committing it eagerly keeps the fight transaction limited to economy + log + profile mutations. The empty-team `db.rollback()` immediately after only undoes a just-flushed brand-new empty profile (there is nothing to prune for such a user), so it cannot lose real data.

### 4.2 `POST /pets/merge` added to `app/routes/pets.py`

The merge route is appended to the existing pets router. Validation order is deliberate so we never leak the existence of another user's pet: ownership is checked via the user-scoped `list_user_instances` lookup, and any id not in that set yields a `404` ("pet not found") — identical to the message a genuinely nonexistent id would produce. Same-species, distinct, and target-not-maxed checks are `400`. The actual mutation (add 1 xp capped at 5, delete the sacrifice) lives in `merge_instances` (CRUD, flush only); the route owns validation and the single commit, mirroring the lootbox `try/except/rollback`.

The route fetches both instances **once** from the `instances_by_id` map it already built (no redundant per-id queries), validates, and reuses the species it already has to compute the response (no second `get_pet_species` call).

Add these imports to the **top** of `app/routes/pets.py` (extend the existing import lines — `HTTPException` is added to the `fastapi` import, and the new module imports are added):

```python
# fastapi-server/app/routes/pets.py  (imports block — replace the existing imports with this)
from pydantic import BaseModel

from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import list_user_instances, set_active, merge_instances
from app.crud.pet_species import get_pet_species
from app.utils.pet_assets import sign_sprite_url
from app.utils.battle_engine import level_for_xp, species_special, RARITY_BASE
```

Then append this route to the **bottom** of `app/routes/pets.py`:

```python
# fastapi-server/app/routes/pets.py  (append to end of file)
class MergeBody(BaseModel):
    targetInstanceId: str
    sacrificeInstanceId: str


@router.post("/merge")
def merge_req(body: MergeBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    if body.targetInstanceId == body.sacrificeInstanceId:
        raise HTTPException(400, "cannot merge a pet into itself")

    instances_by_id = {i.instance_id: i for i in list_user_instances(db, session.user_id)}

    target = instances_by_id.get(body.targetInstanceId)
    sacrifice = instances_by_id.get(body.sacrificeInstanceId)

    # Ownership is enforced by only consulting the user-scoped map, so an id that
    # belongs to another user is indistinguishable from one that does not exist.
    if target is None or sacrifice is None:
        raise HTTPException(404, "pet not found")

    if target.species_id != sacrifice.species_id:
        raise HTTPException(400, "pets must be the same species to merge")

    if target.xp >= 5:
        raise HTTPException(400, "target pet is already at the maximum level")

    species_by_id = {s.species_id: s for s in get_pet_species(db)}
    species = species_by_id.get(target.species_id)
    if species is None:
        raise HTTPException(400, "pet species is not available")

    try:
        updated = merge_instances(db, session.user_id, body.targetInstanceId, body.sacrificeInstanceId)
        db.commit()
        db.refresh(updated)
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not merge pets")

    xp = updated.xp
    level = level_for_xp(xp)
    base_attack, base_health = RARITY_BASE.get(species.rarity, (2, 3))
    config = species.config or {}
    attack = int(config.get("baseAttack", base_attack)) + xp
    health = int(config.get("baseHealth", base_health)) + xp

    return {
        "ok": True,
        "target": {
            "instanceId": updated.instance_id,
            "speciesId": updated.species_id,
            "level": level,
            "xp": xp,
            "attack": attack,
            "health": health,
        },
    }
```

The CRUD `merge_instances` (defined in `app/crud/pets.py` alongside the other pet CRUD — **this is the single definition; there is no committing "thick" variant**) performs the mutation with flush-only semantics so this route is the sole committer. Because the route has already validated ownership/distinctness/species/xp, the mutator stays minimal — it re-fetches both rows under a user-scoped filter and guards against `None` defensively, then flushes:

```python
# fastapi-server/app/crud/pets.py  (append to end of file)
def merge_instances(db: Session, user_id: int, target_instance_id: str, sacrifice_instance_id: str) -> Pet_Instance:
    """Feed `sacrifice` into `target` (same species, distinct, user-owned, target xp<5).

    Adds 1 xp to the target (capped at 5), deletes the sacrifice. Flush only —
    the calling route owns the commit, mirroring create_instance. The route
    performs all validation; the None guard here is purely defensive.
    """
    target = db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id,
                                            Pet_Instance.instance_id == target_instance_id).first()
    sacrifice = db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id,
                                              Pet_Instance.instance_id == sacrifice_instance_id).first()

    if target is None or sacrifice is None:
        raise ValueError("merge target or sacrifice not found for user")

    target.xp = min(5, target.xp + 1)
    target.level = level_for_xp(target.xp)

    db.delete(sacrifice)
    db.flush()
    db.refresh(target)

    return target
```

`merge_instances` imports `level_for_xp` from `app.utils.battle_engine` (add `from app.utils.battle_engine import level_for_xp` to the top of `app/crud/pets.py`) so the persisted `level` column stays consistent with the derived `xp`. The route never relies on the stored `level` for its response — it recomputes from `xp` via the authoritative `level_for_xp` — but keeping the column in sync means `/pets/inventory` (which now returns `level` and `xp` per instance, per section 1) reflects merges immediately. There is exactly one committer (the route), so section 2.6's "who commits" table lists `merge_instances` as **No — flush**.

### 4.3 `app/main.py` registration

Add the import alongside the other route imports and register the router with the others:

```python
# fastapi-server/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import env
from app.routes import blackjack, messages, points, themes, users, ws
from app.routes import leaderboard
from app.routes import pets
from app.routes import lootboxes
from app.routes import pet_assets
from app.routes import battle

app = FastAPI()

app.include_router(users.router)
app.include_router(leaderboard.router)
app.include_router(points.router)
app.include_router(blackjack.router)
app.include_router(themes.router)
app.include_router(ws.router)
app.include_router(messages.router)
app.include_router(pets.router)
app.include_router(lootboxes.router)
app.include_router(pet_assets.router)
app.include_router(battle.router)
```

### 4.4 Why the transaction layering is correct

- **Single committer.** `update_user_points`, `create_instance`, `save_team`, `record_battle_result`, and `merge_instances` all `flush()` and never `commit()`. The route's `db.commit()` is the only commit in the request, so the reward grant, the profile mutation, and the `Battle_Log` insert land atomically — exactly the property the lootbox `open_box` route guarantees for "deduct points + create instance + insert open-log."
- **NOT NULL columns are populated.** The fight route passes `enemy_tier=tier` (computed as `profile.trophies` before the ladder deltas) so the non-nullable `Battle_Log.enemy_tier` column never violates its constraint, alongside `result`, `reward`, `trophies_after`, and `seed_hash`.
- **Validation rolls back cleanly.** `except HTTPException: db.rollback(); raise` ensures a 400 (same-species/maxed) or 404 (unknown pet) leaves the DB untouched and surfaces the original status/detail to the client unchanged, rather than being swallowed into a 500. The fight route's pre-`try` empty-team check additionally `db.rollback()`s the just-created empty profile before raising its 400.
- **One reward formula.** The reward is computed by `reward_for(result, tier, profile.streak)` from `app/utils/battle_engine.py` — the same function the engine documents — so the `min(300, ...)`/streak math lives in exactly one place and cannot drift. `record_battle_result` mutates `profile.trophies`/`profile.streak` in place *before* `reward_for` reads `profile.streak`, so `trophiesAfter`, `streakAfter`, and the `streak*5` reward term are all consistent with the SPEC's "streak AFTER incrementing" requirement. Because everything is in one transaction, a failure anywhere (engine, points CRUD, log insert) rolls the whole thing back and the player neither gains points nor moves on the ladder.

---

## 5. Client types & data layer

This section adds the client-side TypeScript that mirrors the server contract: the leveling fields on the existing pet types, a new `battle.ts` model file that is an exact mirror of the server event union and snapshots, and a `BattleContext` provider + `useBattle` hook that is the single source of truth for the battle profile/team. All code matches the pets module style: **4-space indent, single quotes, no semicolons**.

### (a) Deltas to `client/src/modules/pets/models/pet.ts`

These are focused edits to the existing file (not a rewrite). Add the `PetSpecial` interface, the three new fields on `PetSpecies` (which `SpeciesEntry` inherits for free since it `extends PetSpecies`), and `level`/`xp` on `PetInstance`. Because the server spreads `**s.config` into the `/pets/species` entry and `config` now carries `baseAttack`/`baseHealth`/`special`, these land on `SpeciesEntry` automatically — and the extended `/pets/inventory` route now returns `level`/`xp` per instance.

`PetSpecial` is the **species-level catalog** descriptor and carries `tier`/`magnitude` (those live in `pet_species.config` and reach the client via the `**s.config` spread). It is defined here in `pet.ts` and **only** here — do not redefine or re-import it from `battle.ts`. The trimmed snapshot ability descriptor (no tier/magnitude) is a separate type called `SnapshotSpecial`, defined in `battle.ts` (see part b).

```ts
// client/src/modules/pets/models/pet.ts
// --- ADD this interface (near the top, e.g. just below the Rarity / BehaviorId types) ---
export interface PetSpecial {
    id: string
    name: string
    description: string
    tier: number
    magnitude: number
}
```

```ts
// client/src/modules/pets/models/pet.ts
// --- EXTEND the existing PetSpecies interface ---
// Add the three battle fields. They arrive via the server's `**s.config` spread,
// so SpeciesEntry (which `extends PetSpecies`) inherits them with no extra change.
export interface PetSpecies {
    speciesId: string
    displayName: string
    rarity: Rarity
    width: number
    height: number
    hitboxInset?: { x: number, y: number }
    defaultSpeed: number
    behaviorBag: BehaviorId[]
    behaviorWeights?: Partial<Record<BehaviorId, number>>
    animations: Record<BehaviorId, AnimationConfig>
    spriteSheets: Record<BehaviorId, string>
    soundCues?: Partial<Record<BehaviorId, string>>
    baseAttack: number
    baseHealth: number
    special: PetSpecial | null
}
```

```ts
// client/src/modules/pets/models/pet.ts
// --- EXTEND the existing PetInstance interface ---
// `level` and `xp` now come back from the extended /pets/inventory route.
export interface PetInstance {
    instanceId: string
    speciesId: string
    nickname?: string
    unlockedAt: string
    active: boolean
    level: number
    xp: number
}
```

### (b) New file `client/src/modules/pets/models/battle.ts`

This is the exact client mirror of the server's JSON. Every field name is camelCase and identical to the wire shapes in the spec (`PetSnapshot`, `BattleEffect`, the discriminated `BattleEvent` union keyed on `type`, plus the `/battle/profile`, `/battle/fight`, and `/pets/merge` response envelopes). `BattleEvent` is a discriminated union — narrow on `event.type` and TypeScript will give you the right payload.

This file is authored **once**, here. The UI sections import these exact names (`SnapshotSpecial`, `BattleEffect`, `MergeResponse`, etc.) from this file and must not re-declare them. Note the two distinct ability types: `SnapshotSpecial` (the trimmed `{ id, name, description }` carried on a `PetSnapshot`/`TeamPet`) lives here; the richer species-catalog `PetSpecial` (with `tier`/`magnitude`) lives in `pet.ts` and is **not** re-exported from this file.

```ts
// client/src/modules/pets/models/battle.ts
import type { Rarity } from './pet'

export type BattleSide = 'player' | 'enemy'

export type BattleResult = 'win' | 'loss' | 'draw'

// The ability shown on a snapshot is the trimmed catalog descriptor (no tier/magnitude).
export interface SnapshotSpecial {
    id: string
    name: string
    description: string
}

// Mirror of the server PetSnapshot. `instanceId` is null for summoned tokens.
export interface PetSnapshot {
    instanceId: string | null
    speciesId: string
    displayName: string
    rarity: Rarity
    attack: number
    health: number
    maxHealth: number
    level: number
    special: SnapshotSpecial | null
    isToken?: boolean
}

// A single stat change applied to one pet at a given line index AT THE TIME of the event.
export interface BattleEffect {
    side: BattleSide
    index: number
    dHealth?: number
    dAttack?: number
}

// --- Discriminated union on `type`, exact mirror of the server event log ---

export interface StartEvent {
    type: 'start'
    player: PetSnapshot[]
    enemy: PetSnapshot[]
}

export interface AbilityEvent {
    type: 'ability'
    side: BattleSide
    sourceIndex: number
    abilityId: string
    abilityName: string
    effects: BattleEffect[]
    note?: string
}

export interface AttackEvent {
    type: 'attack'
    playerDamage: number
    enemyDamage: number
    playerHealthAfter: number
    enemyHealthAfter: number
}

export interface FaintEvent {
    type: 'faint'
    side: BattleSide
    index: number
}

export interface SummonEvent {
    type: 'summon'
    side: BattleSide
    index: number
    pet: PetSnapshot
}

export interface EndEvent {
    type: 'end'
    result: BattleResult
}

export type BattleEvent =
    | StartEvent
    | AbilityEvent
    | AttackEvent
    | FaintEvent
    | SummonEvent
    | EndEvent

// --- Profile / team / response envelopes ---

export interface BattleProfile {
    trophies: number
    wins: number
    losses: number
    streak: number
    bestStreak: number
}

// A saved-team pet resolved to a live instance with computed battle stats.
export interface TeamPet {
    instanceId: string
    speciesId: string
    displayName: string
    rarity: Rarity
    attack: number
    health: number
    level: number
    special: SnapshotSpecial | null
}

// GET /battle/profile and POST /battle/team both return this shape.
export interface ProfileResponse {
    ok: boolean
    profile: BattleProfile
    team: TeamPet[]
}

// POST /battle/fight
export interface FightResponse {
    ok: boolean
    result: BattleResult
    reward: number
    trophiesAfter: number
    streakAfter: number
    pointsRemaining: number
    playerTeam: PetSnapshot[]
    enemyTeam: PetSnapshot[]
    events: BattleEvent[]
}

// POST /pets/merge -> updated target instance, nested under `target`
// (matches the server route, which returns { ok, target: { ... } }).
export interface MergeResponse {
    ok: boolean
    target: {
        instanceId: string
        speciesId: string
        level: number
        xp: number
        attack: number
        health: number
    }
}
```

### (c) `BattleContext` provider + `useBattle` hook + shared stat helper

Single context file at `client/src/modules/pets/contexts/BattleContext.tsx`, mirroring `PetInventoryProvider`. It owns one copy of `profile`/`team`/`loading`, and exposes `refetchProfile()`, `saveTeam(instanceIds)`, `fight()` and `merge(targetId, sacrificeId)`. Every call hits `serverUrl` with `credentials: 'include'`; mutating calls POST JSON. After a `fight()` or `merge()`, the hook pulls the points + inventory refetchers off their contexts and refreshes them so the rest of the app (points display, inventory list) stays in sync.

It also exports a small pure helper (`petStats`) that computes `attack`/`health`/`level` from an instance + species using the **same formulas as the server** — used by the team-builder preview so the UI matches the eventual battle stats exactly.

```ts
// client/src/modules/pets/hooks/petStats.ts
import type { PetInstance, PetSpecies } from '../models/pet'

// Authoritative stat formulas — MUST stay identical to the server.
//   attack(instance) = species.baseAttack + instance.xp
//   health(instance) = species.baseHealth + instance.xp
//   level(instance)  = 1 if xp<2 else 2 if xp<5 else 3   (xp in [0,5])
export interface ComputedStats {
    attack: number
    health: number
    level: number
}

export function levelFromXp(xp: number): number {
    if (xp < 2) return 1
    if (xp < 5) return 2
    return 3
}

export function petStats(
    instance: Pick<PetInstance, 'xp'>,
    species: Pick<PetSpecies, 'baseAttack' | 'baseHealth'>,
): ComputedStats {
    return {
        attack: species.baseAttack + instance.xp,
        health: species.baseHealth + instance.xp,
        level: levelFromXp(instance.xp),
    }
}
```

```tsx
// client/src/modules/pets/contexts/BattleContext.tsx
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react'

import { serverUrl } from '../../../utils/env'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { usePetInventoryContext } from './PetInventoryContext'
import type {
    BattleProfile,
    FightResponse,
    MergeResponse,
    ProfileResponse,
    TeamPet,
} from '../models/battle'

type BattleContextType = {
    profile: BattleProfile | null
    team: TeamPet[]
    loading: boolean
    refetchProfile: () => Promise<void>
    saveTeam: (instanceIds: string[]) => Promise<void>
    fight: () => Promise<FightResponse | null>
    merge: (
        targetId: string,
        sacrificeId: string,
    ) => Promise<MergeResponse['target'] | null>
}

const BattleContext = createContext<BattleContextType | null>(null)

function useBattle(): BattleContextType {
    const [profile, setProfile] = useState<BattleProfile | null>(null)
    const [team, setTeam] = useState<TeamPet[]>([])
    const [loading, setLoading] = useState(false)

    // Pull the shared refetchers so a fight/merge keeps points + inventory in sync.
    const { fetchPoints } = usePointsContext()
    const { refetch: refetchInventory } = usePetInventoryContext()

    const refetchProfile = useCallback(async () => {
        setLoading(true)

        try {
            const res = await fetch(`${serverUrl}/battle/profile`, {
                credentials: 'include',
            })

            const data: ProfileResponse = await res.json()

            if (data.ok) {
                setProfile(data.profile)
                setTeam(data.team)
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        refetchProfile()
    }, [refetchProfile])

    const saveTeam = useCallback(async (instanceIds: string[]) => {
        const res = await fetch(`${serverUrl}/battle/team`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team: instanceIds }),
        })

        const data: ProfileResponse = await res.json()

        if (data.ok) {
            setProfile(data.profile)
            setTeam(data.team)
        }
    }, [])

    const fight = useCallback(async (): Promise<FightResponse | null> => {
        const res = await fetch(`${serverUrl}/battle/fight`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        })

        const data: FightResponse = await res.json()

        if (!data.ok) {
            return null
        }

        // A fight mutates trophies/streak and pays out points -> resync everything.
        setProfile(prev =>
            prev
                ? {
                    ...prev,
                    trophies: data.trophiesAfter,
                    streak: data.streakAfter,
                }
                : prev,
        )

        await Promise.all([
            refetchProfile(),
            fetchPoints(),
            refetchInventory(),
        ])

        return data
    }, [refetchProfile, fetchPoints, refetchInventory])

    const merge = useCallback(
        async (
            targetId: string,
            sacrificeId: string,
        ): Promise<MergeResponse['target'] | null> => {
            const res = await fetch(`${serverUrl}/pets/merge`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetInstanceId: targetId,
                    sacrificeInstanceId: sacrificeId,
                }),
            })

            const data: MergeResponse = await res.json()

            if (!data.ok) {
                return null
            }

            // Merge deletes the sacrifice and bumps the target xp -> resync inventory,
            // and the team (resolved stats) may change for the leveled pet.
            await Promise.all([refetchInventory(), refetchProfile()])

            return data.target
        },
        [refetchInventory, refetchProfile],
    )

    return {
        profile,
        team,
        loading,
        refetchProfile,
        saveTeam,
        fight,
        merge,
    }
}

export function BattleProvider({ children }: { children: ReactNode }) {
    const battle = useBattle()

    return (
        <BattleContext.Provider value={battle}>
            {children}
        </BattleContext.Provider>
    )
}

export function useBattleContext() {
    const context = useContext(BattleContext)

    if (!context) {
        throw new Error(
            'useBattleContext must be used inside a BattleProvider',
        )
    }

    return context
}
```

### Where to mount the Provider in `App.tsx`

`BattleProvider` depends on both `usePointsContext` and `usePetInventoryContext` (to resync points + inventory after a fight/merge), so it must sit **inside** `PointsProvider` and `PetInventoryProvider`. Mount it right after `PetInventoryProvider` (and outside `ModalProvider`, which is fine since the battle UI is opened via `openModal()`):

```tsx
// client/src/App.tsx
import Typing from './modules/typing'
import { SoundProvider } from './modules/sound/SoundContext'
import { ModalProvider } from './components/modal/ModalProvider'
import { UserProvider } from './utils/User/UserContext'
import { PointsProvider } from './modules/points/contexts/PointsContext'
import { ThemeProvider } from './utils/Theme/ThemeContext'
import { Pets } from './modules/pets'
import { PetInventoryProvider } from './modules/pets/contexts/PetInventoryContext'
import { BattleProvider } from './modules/pets/contexts/BattleContext'

function App() {
    return (
        <UserProvider>
            <ThemeProvider>
                <SoundProvider>
                    <PointsProvider>
                        <PetInventoryProvider>
                            <BattleProvider>
                                <ModalProvider>
                                    <div className="relative overflow-hidden min-h-screen">
                                        <Pets />
                                        <div className="flex items-center justify-center font-mono min-h-screen p-10">
                                            <Typing />
                                        </div>
                                    </div>
                                </ModalProvider>
                            </BattleProvider>
                        </PetInventoryProvider>
                    </PointsProvider>
                </SoundProvider>
            </ThemeProvider>
        </UserProvider>
    )
}

export default App
```

> Note: the launcher button that calls `openModal()` to open the battle/team/merge UI is added next to `<Pets />` in a later section; it consumes `useBattleContext()` so all of those components share this single source of truth — including the `merge()` result, which is the unwrapped `target` object `{ instanceId, speciesId, level, xp, attack, health }`.

---

## 6. Client UI (arena playback, team builder, merge)

This section delivers the player-facing UI. Everything is server-authoritative: the client only *replays* the `events` array returned by `POST /battle/fight` and never decides an outcome. We reuse the existing primitives exactly as they exist in the repo — `useModal()` from `components/modal/ModalContext`, `usePetInventoryContext()`, `usePetSpecies()`, `usePointsContext()`, `RARITY_COLOR`, and `serverUrl`. Style matches the pets module: 4-space indent, single quotes, **no semicolons**.

The work is split into:

- `models/battle.ts` — the shared battle types (mirrors the SPEC event union). **Authored once here** and imported by the rest of the UI; section 6 does not redefine it.
- `hooks/useBattle.ts` + `contexts/BattleContext.tsx` — the `useBattle()` hook exposing `profile`, `team`, `saveTeam`, `fight`, `merge`.
- `components/spriteThumb.ts` — one shared helper for frame-0 sprite tiles (so the arena, team builder and merge panel render pets identically).
- `components/BattleArena.tsx` — the event-stepper playback (a).
- `components/TeamBuilder.tsx` — pick + order up to 5 (b).
- `components/MergePanel.tsx` — duplicate feeding with a level-up flash (c).
- `components/BattleLauncher.tsx` + the `App.tsx` mount (d).
- stat-chips snippet for `PetInventory.tsx` rows (e).

### 6.0 Shared battle types

These mirror the SPEC event union and the `/battle/*` responses one-to-one. They live in their own file (`models/battle.ts`, authored in the client-types section) so the server contract is in one place. The UI components below **import** these names; they do not re-declare them. The two special interfaces are deliberately distinct:

- `PetSpecial` (in `models/pet.ts`) is the **species-catalog** special carried in `**s.config` — it includes `tier` and `magnitude`.
- `SnapshotSpecial` (in `models/battle.ts`) is the **trimmed** special that rides on a `PetSnapshot`/`TeamPet` — only `id`/`name`/`description`.

Effects are named `BattleEffect`. The full `models/battle.ts` file (`SnapshotSpecial`, `PetSnapshot`, `BattleEffect`, the discriminated `BattleEvent` union, and the `ProfileResponse`/`FightResponse`/`MergeResponse` envelopes) plus the `models/pet.ts` extensions (`level`/`xp` on `PetInstance`; `baseAttack`/`baseHealth`/`special` on `PetSpecies`; the catalog `PetSpecial` type) are authored **once** in [§5 Client types & data layer](#5-client-types--data-layer). The components below import those exact names; this section does not re-declare them.

> **Index-shift convention (must match the server exactly).** The front of each line is always index `0`. When a pet faints it is *removed* and every pet behind it shifts forward by one. Therefore the `index` carried by `faint`, `ability`, `summon` and `BattleEffect` is the position **at the moment that event was emitted** — never a stable id. The arena below applies events to a live array (`splice`/in-place mutation) so its indices stay in lock-step with the server's. We key the React list by a per-tile stable `key` we mint at start/summon time (not by index), so a removed tile animates out without React reusing its DOM for the pet that shifted into its slot.

### 6.1 The `useBattle` hook + context

One hook owns all `/battle/*` (and the `/pets/merge`) network calls. We wrap it in a context so the launcher, team builder and merge panel share a single source of truth for `profile`/`team`.

```ts
// client/src/modules/pets/hooks/useBattle.ts
import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'
import type {
    BattleProfile,
    FightResponse,
    MergeResponse,
    ProfileResponse,
    TeamPet,
} from '../models/battle'

export function useBattle() {
    const [profile, setProfile] = useState<BattleProfile | null>(null)
    const [team, setTeam] = useState<TeamPet[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const res = await fetch(`${serverUrl}/battle/profile`, {
                credentials: 'include',
            })

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`)
            }

            const data = (await res.json()) as ProfileResponse

            if (!data.ok) {
                throw new Error('Failed to load battle profile')
            }

            setProfile(data.profile)
            setTeam(data.team)
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProfile()
    }, [fetchProfile])

    // Persist an ordered list of owned instance_ids (front-to-back, <=5).
    const saveTeam = useCallback(async (instanceIds: string[]) => {
        const res = await fetch(`${serverUrl}/battle/team`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team: instanceIds }),
        })

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
        }

        const data = (await res.json()) as ProfileResponse

        if (!data.ok) {
            throw new Error('Failed to save team')
        }

        setProfile(data.profile)
        setTeam(data.team)

        return data.team
    }, [])

    // Run one battle. Server simulates + rewards; we just get the log back.
    const fight = useCallback(async (): Promise<FightResponse> => {
        const res = await fetch(`${serverUrl}/battle/fight`, {
            method: 'POST',
            credentials: 'include',
        })

        const data = (await res.json()) as FightResponse | { ok: false; error?: string }

        if (!res.ok || !data.ok) {
            const message = !data.ok && 'error' in data && data.error
                ? data.error
                : `HTTP ${res.status}`
            throw new Error(message)
        }

        // Reflect the post-fight ladder state immediately.
        setProfile(prev =>
            prev
                ? { ...prev, trophies: data.trophiesAfter, streak: data.streakAfter }
                : prev
        )

        return data
    }, [])

    // Feed a duplicate INTO a target of the same species (+1 xp, sacrifice deleted).
    // Server returns { ok, target: { instanceId, speciesId, level, xp, attack, health } }.
    const merge = useCallback(async (
        targetInstanceId: string,
        sacrificeInstanceId: string,
    ): Promise<MergeResponse['target']> => {
        const res = await fetch(`${serverUrl}/pets/merge`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetInstanceId, sacrificeInstanceId }),
        })

        const data = (await res.json()) as MergeResponse | { ok: false; error?: string }

        if (!res.ok || !data.ok) {
            const message = !data.ok && 'error' in data && data.error
                ? data.error
                : `HTTP ${res.status}`
            throw new Error(message)
        }

        return data.target
    }, [])

    return {
        profile,
        team,
        loading,
        error,
        refetch: fetchProfile,
        saveTeam,
        fight,
        merge,
    }
}
```

```tsx
// client/src/modules/pets/contexts/BattleContext.tsx
import { createContext, useContext, type ReactNode } from 'react'
import { useBattle } from '../hooks/useBattle'

const BattleContext = createContext<ReturnType<typeof useBattle> | null>(null)

export function BattleProvider({ children }: { children: ReactNode }) {
    const battle = useBattle()

    return (
        <BattleContext.Provider value={battle}>
            {children}
        </BattleContext.Provider>
    )
}

export function useBattleContext() {
    const ctx = useContext(BattleContext)

    if (!ctx) {
        throw new Error('useBattleContext must be used inside a BattleProvider')
    }

    return ctx
}
```

### 6.2 Shared sprite-thumb helper

Every battle surface renders a pet as a 64×64 frame-0 tile. Owned species expose `spriteSheets[behavior]`; unowned (and enemy) species fall back to `previewUrl` (the silhouette). All URLs are host-relative, so we prefix `serverUrl`. This single helper keeps the arena, team builder and merge panel pixel-identical.

```ts
// client/src/modules/pets/components/spriteThumb.ts
import { serverUrl } from '../../../utils/env'
import type { SpeciesEntry } from '../models/pet'

// Resolve the frame-0 sprite-sheet URL for a species the player owns,
// otherwise its silhouette preview. Returns undefined if neither exists.
export function spriteThumbUrl(species?: SpeciesEntry): string | undefined {
    if (!species) return undefined

    if (species.owned && species.spriteSheets) {
        const sheet = species.spriteSheets.idle
            ?? Object.values(species.spriteSheets)[0]
        if (sheet) return `${serverUrl}${sheet}`
    }

    if (species.previewUrl) {
        return `${serverUrl}${species.previewUrl}`
    }

    return undefined
}

// Inline style for a 64x64 frame-0 tile (pixel-art, top-left frame).
export function spriteThumbStyle(
    url: string | undefined,
    size = 64,
): React.CSSProperties {
    return {
        width: size,
        height: size,
        imageRendering: 'pixelated',
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundPosition: '0 0',
        backgroundRepeat: 'no-repeat',
    }
}
```

### 6.3 `BattleArena` — animated event playback (a)

The arena takes a `FightResponse` and walks its `events` array on a timer. Each event mutates a local render model and bumps a `tick` so React repaints. We honour `prefers-reduced-motion` by computing the *final* board state in one pass and skipping straight to the end banner.

**On-screen data model.** Each side is an array of `ArenaPet`. An `ArenaPet` wraps the `PetSnapshot` with live, animatable fields (`health`, `attack`, `maxHealth`), a stable `key` (so React never reuses a dying tile's DOM), and transient flags that drive CSS (`lunging`, `hurt`, `fainting`). Floating ability popups live in a separate `popups` array keyed by an incrementing id so several can stack.

The server `PetSnapshot` union does **not** carry a `side` field, and we never add one to the shared type (it must stay an exact mirror of the server union). Where the arena needs to know a snapshot's side locally — only while seeding the start/summon lines — we use a component-local `SidedSnapshot = PetSnapshot & { side: BattleSide }`. The stable tile key is minted purely from an incrementing counter plus the instance/species id, so it never depends on `side`.

```tsx
// client/src/modules/pets/components/BattleArena.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../../../components/modal/ModalContext'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { SpeciesEntry } from '../models/pet'
import type {
    BattleEffect,
    BattleEvent,
    BattleSide,
    FightResponse,
    PetSnapshot,
} from '../models/battle'

// Per-event playback delays (ms). Snapped to 0 when reduced-motion is on.
const T_ABILITY = 700
const T_ATTACK = 650
const T_FAINT = 500
const T_SUMMON = 550
const LUNGE_MS = 220
const POPUP_MS = 1100

// A snapshot tagged with its side, used ONLY locally while seeding lines.
// `side` is never added to the shared PetSnapshot (server union has none).
type SidedSnapshot = PetSnapshot & { side: BattleSide }

// Live, animatable on-screen pet. `key` is stable for the tile's lifetime so a
// fainting pet keeps its own DOM node while the survivor behind it shifts in.
interface ArenaPet {
    key: string
    snap: PetSnapshot
    attack: number
    health: number
    maxHealth: number
    lunging: boolean
    hurt: boolean
    fainting: boolean
    summoning: boolean
}

interface FloatingPopup {
    id: number
    side: BattleSide
    index: number
    title: string
    lines: string[]
}

let _popupId = 0
let _keyId = 0

// `side` is no longer part of the key — a monotonic counter guarantees
// uniqueness, so toArenaPet works on a plain PetSnapshot.
function toArenaPet(snap: PetSnapshot): ArenaPet {
    return {
        key: `${snap.instanceId ?? snap.speciesId}-${_keyId++}`,
        snap,
        attack: snap.attack,
        health: snap.health,
        maxHealth: snap.maxHealth,
        lunging: false,
        hurt: false,
        fainting: false,
        summoning: false,
    }
}

// Human-readable summary of an ability's effects for the floating popup.
function describeEffects(effects: BattleEffect[]): string[] {
    return effects.map(e => {
        const parts: string[] = []
        if (e.dAttack) parts.push(`${e.dAttack > 0 ? '+' : ''}${e.dAttack} atk`)
        if (e.dHealth) parts.push(`${e.dHealth > 0 ? '+' : ''}${e.dHealth} hp`)
        const who = e.side === 'player' ? 'ally' : 'enemy'
        return parts.length ? `${who} #${e.index + 1}: ${parts.join(', ')}` : `${who} #${e.index + 1}`
    })
}

export function BattleArena({ fight }: { fight: FightResponse }) {
    const { closeModal } = useModal()
    const { species } = usePetSpecies()
    const { fetchPoints } = usePointsContext()
    const { refetch: refetchInventory } = usePetInventoryContext()

    const speciesById = useMemo(() => {
        const map = new Map<string, SpeciesEntry>()
        for (const s of species) map.set(s.speciesId, s)
        return map
    }, [species])

    const [playerLine, setPlayerLine] = useState<ArenaPet[]>([])
    const [enemyLine, setEnemyLine] = useState<ArenaPet[]>([])
    const [popups, setPopups] = useState<FloatingPopup[]>([])
    const [ended, setEnded] = useState<'win' | 'loss' | 'draw' | null>(null)

    // Mutable working copies so the stepper can read/write lines synchronously
    // between React commits without racing stale state.
    const player = useRef<ArenaPet[]>([])
    const enemy = useRef<ArenaPet[]>([])
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    const lineRef = (side: BattleSide) =>
        side === 'player' ? player : enemy
    const setLine = (side: BattleSide, next: ArenaPet[]) =>
        side === 'player' ? setPlayerLine(next) : setEnemyLine(next)

    // Refunds points + inventory once playback (or snap) settles on the result.
    const settle = (result: 'win' | 'loss' | 'draw') => {
        setEnded(result)
        fetchPoints()
        refetchInventory()
    }

    useEffect(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        // Seed both lines from the start event (falling back to the team arrays).
        // The local `side` tag is only here for symmetry/readability; the key
        // no longer depends on it.
        const start = fight.events.find(e => e.type === 'start')
        const startPlayer: SidedSnapshot[] = (start && start.type === 'start' ? start.player : fight.playerTeam)
            .map(p => ({ ...p, side: 'player' as const }))
        const startEnemy: SidedSnapshot[] = (start && start.type === 'start' ? start.enemy : fight.enemyTeam)
            .map(p => ({ ...p, side: 'enemy' as const }))

        player.current = startPlayer.map(toArenaPet)
        enemy.current = startEnemy.map(toArenaPet)
        setPlayerLine([...player.current])
        setEnemyLine([...enemy.current])

        if (reduce) {
            // Snap: apply every event with zero animation, show the banner.
            for (const ev of fight.events) applyEvent(ev, true)
            setPlayerLine([...player.current])
            setEnemyLine([...enemy.current])
            settle(fight.result)
            return
        }

        // Schedule the events back-to-back, each after the prior's animation.
        let delay = 250
        for (const ev of fight.events) {
            const dur = durationFor(ev)
            const at = delay
            timers.current.push(setTimeout(() => playEvent(ev), at))
            delay += dur
        }

        return () => {
            for (const t of timers.current) clearTimeout(t)
            timers.current = []
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fight])

    function durationFor(ev: BattleEvent): number {
        switch (ev.type) {
            case 'ability': return T_ABILITY
            case 'attack': return T_ATTACK
            case 'faint': return T_FAINT
            case 'summon': return T_SUMMON
            default: return 200
        }
    }

    // Animated path: mutate refs, flush to state, clear transient flags after.
    function playEvent(ev: BattleEvent) {
        applyEvent(ev, false)
        setPlayerLine([...player.current])
        setEnemyLine([...enemy.current])

        if (ev.type === 'attack') {
            timers.current.push(setTimeout(() => {
                for (const p of player.current) { p.lunging = false; p.hurt = false }
                for (const e of enemy.current) { e.lunging = false; e.hurt = false }
                setPlayerLine([...player.current])
                setEnemyLine([...enemy.current])
            }, LUNGE_MS))
        }

        if (ev.type === 'end') settle(ev.result)
    }

    // Core reducer: applies one event to the working lines. `snap` = no anim.
    function applyEvent(ev: BattleEvent, snap: boolean) {
        switch (ev.type) {
            case 'start':
                // Lines already built in the effect; nothing further to do.
                break

            case 'ability': {
                for (const eff of ev.effects) {
                    const line = lineRef(eff.side).current
                    const pet = line[eff.index]
                    if (!pet) continue
                    if (eff.dAttack) pet.attack = Math.max(0, pet.attack + eff.dAttack)
                    if (eff.dHealth) {
                        pet.health = Math.max(0, pet.health + eff.dHealth)
                        if (pet.health > pet.maxHealth) pet.maxHealth = pet.health
                    }
                }
                if (!snap) pushPopup(ev.side, ev.sourceIndex, ev.abilityName, describeEffects(ev.effects), ev.note)
                break
            }

            case 'attack': {
                const pf = player.current[0]
                const ef = enemy.current[0]
                if (pf) { pf.health = ev.playerHealthAfter; if (!snap) { pf.lunging = true; pf.hurt = ev.enemyDamage > 0 } }
                if (ef) { ef.health = ev.enemyHealthAfter; if (!snap) { ef.lunging = true; ef.hurt = ev.playerDamage > 0 } }
                break
            }

            case 'faint': {
                const line = lineRef(ev.side).current
                const pet = line[ev.index]
                if (!pet) break
                if (snap) {
                    line.splice(ev.index, 1)
                } else {
                    // Fade the tile out, then remove it (line shifts forward).
                    pet.fainting = true
                    timers.current.push(setTimeout(() => {
                        const i = line.indexOf(pet)
                        if (i >= 0) line.splice(i, 1)
                        setLine(ev.side, [...line])
                    }, T_FAINT - 80))
                }
                break
            }

            case 'summon': {
                const line = lineRef(ev.side).current
                const fresh = toArenaPet(ev.pet)
                if (!snap) fresh.summoning = true
                line.splice(ev.index, 0, fresh)
                if (!snap) {
                    timers.current.push(setTimeout(() => {
                        fresh.summoning = false
                        setLine(ev.side, [...line])
                    }, T_SUMMON - 80))
                }
                break
            }

            case 'end':
                // Banner is shown by playEvent/settle.
                break
        }
    }

    function pushPopup(
        side: BattleSide,
        index: number,
        title: string,
        lines: string[],
        note?: string,
    ) {
        const id = _popupId++
        const all = note ? [note, ...lines] : lines
        setPopups(prev => [...prev, { id, side, index, title, lines: all }])
        timers.current.push(setTimeout(() => {
            setPopups(prev => prev.filter(p => p.id !== id))
        }, POPUP_MS))
    }

    return (
        <div className="flex flex-col items-center gap-4 p-6 rounded-xl [background:var(--bg)] border min-w-[640px]">
            <h2 className="text-lg font-semibold tracking-wide">Battle</h2>

            <ArenaLine
                pets={enemyLine}
                side="enemy"
                popups={popups}
                speciesById={speciesById}
                facing={-1}
            />

            <div className="h-px w-full bg-white/10" />

            <ArenaLine
                pets={playerLine}
                side="player"
                popups={popups}
                speciesById={speciesById}
                facing={1}
            />

            {ended && (
                <ResultBanner result={ended} fight={fight} onClose={closeModal} />
            )}
        </div>
    )
}

// ---- One facing line of pet tiles ---------------------------------------

function ArenaLine({
    pets,
    side,
    popups,
    speciesById,
    facing,
}: {
    pets: ArenaPet[]
    side: BattleSide
    popups: FloatingPopup[]
    speciesById: Map<string, SpeciesEntry>
    facing: 1 | -1
}) {
    return (
        <div
            className={`flex items-end gap-3 w-full ${
                side === 'enemy' ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
            }`}
        >
            {pets.map((pet, index) => (
                <ArenaTile
                    key={pet.key}
                    pet={pet}
                    side={side}
                    index={index}
                    facing={facing}
                    species={speciesById.get(pet.snap.speciesId)}
                    popup={popups.find(p => p.side === side && p.index === index)}
                />
            ))}
            {pets.length === 0 && (
                <span className="opacity-40 text-sm py-8">— defeated —</span>
            )}
        </div>
    )
}

// ---- A single pet tile (sprite + health bar + lunge/hurt/faint anim) -----

function ArenaTile({
    pet,
    side,
    index,
    facing,
    species,
    popup,
}: {
    pet: ArenaPet
    side: BattleSide
    index: number
    facing: 1 | -1
    species?: SpeciesEntry
    popup?: FloatingPopup
}) {
    const color = RARITY_COLOR[pet.snap.rarity] ?? '#9ca3af'
    const url = spriteThumbUrl(species)
    const isFront = index === 0
    const hpPct = pet.maxHealth > 0
        ? Math.max(0, Math.min(100, (pet.health / pet.maxHealth) * 100))
        : 0

    // Lunge toward the opposing line; mirror enemy sprites to face the player.
    const lungeX = pet.lunging ? facing * 18 : 0
    const transform = `translateX(${lungeX}px) scaleX(${side === 'enemy' ? -1 : 1})`

    return (
        <div
            className="relative flex flex-col items-center gap-1"
            style={{
                opacity: pet.fainting ? 0 : 1,
                transition: 'opacity 360ms ease, transform 200ms ease',
                transform: pet.summoning ? 'scale(0.2)' : 'scale(1)',
            }}
        >
            {popup && (
                <div
                    className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 pointer-events-none whitespace-nowrap text-center"
                    style={{ animation: `floatup ${POPUP_MS}ms ease-out forwards` }}
                >
                    <div className="font-bold text-xs" style={{ color }}>
                        {popup.title}
                    </div>
                    {popup.lines.map((l, i) => (
                        <div key={i} className="text-[10px] opacity-80">{l}</div>
                    ))}
                </div>
            )}

            {/* sprite, mirrored for enemies, lunging on clash */}
            <div
                style={{
                    ...spriteThumbStyle(url),
                    transform,
                    transition: pet.lunging
                        ? `transform ${LUNGE_MS / 2}ms ease-out`
                        : 'transform 160ms ease-in',
                    filter: pet.hurt
                        ? 'brightness(2) drop-shadow(0 0 6px #ef4444)'
                        : `drop-shadow(0 0 4px ${color})`,
                }}
            />

            {/* name + FRONT badge */}
            <div className="flex items-center gap-1">
                {isFront && (
                    <span className="text-[9px] uppercase tracking-wider opacity-60">front</span>
                )}
                <span className="text-[11px] font-medium" style={{ color }}>
                    {pet.snap.displayName}
                </span>
            </div>

            {/* health bar (animates width on damage) */}
            <div className="w-16 h-2 rounded bg-white/10 overflow-hidden">
                <div
                    className="h-full rounded"
                    style={{
                        width: `${hpPct}%`,
                        background: hpPct > 33 ? '#22c55e' : '#ef4444',
                        transition: 'width 300ms ease, background 300ms ease',
                    }}
                />
            </div>

            {/* attack / health chips */}
            <div className="flex gap-1 text-[10px] font-mono">
                <span className="px-1 rounded bg-red-500/20 text-red-300">⚔ {pet.attack}</span>
                <span className="px-1 rounded bg-emerald-500/20 text-emerald-300">❤ {Math.max(0, pet.health)}</span>
            </div>
        </div>
    )
}

// ---- WIN / LOSS / DRAW banner with the reward ----------------------------

function ResultBanner({
    result,
    fight,
    onClose,
}: {
    result: 'win' | 'loss' | 'draw'
    fight: FightResponse
    onClose: () => void
}) {
    const label = result === 'win' ? 'VICTORY' : result === 'loss' ? 'DEFEAT' : 'DRAW'
    const color = result === 'win' ? '#22c55e' : result === 'loss' ? '#ef4444' : '#9ca3af'

    return (
        <div
            className="flex flex-col items-center gap-2 mt-2 px-6 py-4 rounded-xl border"
            style={{ boxShadow: `0 0 36px ${color}`, transition: 'box-shadow .3s' }}
        >
            <span className="text-2xl font-black tracking-widest" style={{ color }}>
                {label}
            </span>
            {result === 'win' && (
                <span className="text-sm">
                    +{fight.reward} points · {fight.trophiesAfter} 🏆 · streak {fight.streakAfter}
                </span>
            )}
            {result === 'draw' && (
                <span className="text-sm">+{fight.reward} points · {fight.trophiesAfter} 🏆</span>
            )}
            {result === 'loss' && (
                <span className="text-sm opacity-70">No reward · {fight.trophiesAfter} 🏆</span>
            )}
            <span className="text-xs opacity-60">Points remaining: {fight.pointsRemaining}</span>
            <button onClick={onClose} className="mt-1 rounded-xl px-4 py-1 border">
                Close
            </button>
        </div>
    )
}
```

Two tiny keyframes power the floating popup. Tailwind v4 reads the project stylesheet, so add this once to your global CSS (e.g. the file that hosts your `@import 'tailwindcss'`):

```css
/* client/src/index.css (append) */
@keyframes floatup {
    0%   { opacity: 0; transform: translate(-50%, -90%) scale(0.8); }
    15%  { opacity: 1; transform: translate(-50%, -100%) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -160%) scale(1); }
}
```

> Note on side: the server `PetSnapshot` union does not carry `side`, and we never add it to the shared type. The arena tracks side via React props (`ArenaLine`/`ArenaTile` receive a `side`), and the popup index/side match is done at render time — no per-snapshot `side` field and no `as PetSnapshot` casts are needed. The local `SidedSnapshot` alias exists only for readability while seeding the two start lines.

### 6.4 `TeamBuilder` — pick & order up to 5 (b)

Lists owned pets from inventory, computes `atk`/`hp`/`level` from the species base stats + instance `xp`, colours by rarity, and renders the frame-0 thumb. Click-to-add appends to the ordered team (max 5); within the team you reorder with up/down and remove with ✕. Index 0 is labelled **FRONT**. Save calls `useBattle().saveTeam`.

```tsx
// client/src/modules/pets/components/TeamBuilder.tsx
import { useMemo, useState } from 'react'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { useBattleContext } from '../contexts/BattleContext'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { SpeciesEntry } from '../models/pet'

const MAX_TEAM = 5

// Authoritative stat formulas — identical to the server.
function statsFor(xp: number, species?: SpeciesEntry) {
    const base = species ? { atk: species.baseAttack, hp: species.baseHealth } : { atk: 0, hp: 0 }
    const level = xp < 2 ? 1 : xp < 5 ? 2 : 3
    return { attack: base.atk + xp, health: base.hp + xp, level }
}

export function TeamBuilder() {
    const { inventory } = usePetInventoryContext()
    const { team, saveTeam } = useBattleContext()
    const { species } = usePetSpecies()

    const meta = useMemo(() => {
        const map = new Map<string, SpeciesEntry>()
        for (const s of species) map.set(s.speciesId, s)
        return map
    }, [species])

    // Seed the editor from the saved team (front-to-back order preserved).
    const [order, setOrder] = useState<string[]>(() => team.map(t => t.instanceId))
    const [saving, setSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState<string | null>(null)

    const byId = useMemo(() => {
        const map = new Map<string, (typeof inventory)[number]>()
        for (const p of inventory) map.set(p.instanceId, p)
        return map
    }, [inventory])

    const inTeam = (id: string) => order.includes(id)

    const add = (id: string) => {
        if (inTeam(id) || order.length >= MAX_TEAM) return
        setOrder(prev => [...prev, id])
        setSavedMsg(null)
    }
    const remove = (id: string) => {
        setOrder(prev => prev.filter(x => x !== id))
        setSavedMsg(null)
    }
    const move = (index: number, dir: -1 | 1) => {
        const j = index + dir
        if (j < 0 || j >= order.length) return
        setOrder(prev => {
            const next = [...prev]
            const tmp = next[index]
            next[index] = next[j]
            next[j] = tmp
            return next
        })
        setSavedMsg(null)
    }

    const save = async () => {
        try {
            setSaving(true)
            setSavedMsg(null)
            await saveTeam(order)
            setSavedMsg('Team saved')
        } catch (err) {
            setSavedMsg((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const bench = inventory.filter(p => !inTeam(p.instanceId))

    return (
        <div className="flex flex-col gap-4 p-4 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-semibold text-center">Your team</h2>

            {/* current ordered team — index 0 is FRONT */}
            <div className="flex flex-col gap-2">
                {order.length === 0 && (
                    <p className="opacity-60 text-sm text-center py-2">
                        Add up to {MAX_TEAM} pets below. The top pet fights first.
                    </p>
                )}
                {order.map((id, index) => {
                    const inst = byId.get(id)
                    const s = inst && meta.get(inst.speciesId)
                    const stats = statsFor(inst?.xp ?? 0, s)
                    const rarity = s?.rarity ?? 'common'
                    return (
                        <div
                            key={id}
                            className="flex items-center gap-3 rounded-lg border px-2 py-1"
                            style={{ borderColor: RARITY_COLOR[rarity] }}
                        >
                            <span className="w-12 text-[10px] uppercase tracking-wide opacity-60">
                                {index === 0 ? 'front' : `#${index + 1}`}
                            </span>
                            <div style={spriteThumbStyle(spriteThumbUrl(s), 40)} />
                            <span className="flex-1 font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                                {inst?.nickname ?? s?.displayName ?? id}
                            </span>
                            <StatChips attack={stats.attack} health={stats.health} level={stats.level} />
                            <div className="flex flex-col">
                                <button
                                    onClick={() => move(index, -1)}
                                    disabled={index === 0}
                                    className="text-xs px-1 disabled:opacity-30"
                                >▲</button>
                                <button
                                    onClick={() => move(index, 1)}
                                    disabled={index === order.length - 1}
                                    className="text-xs px-1 disabled:opacity-30"
                                >▼</button>
                            </div>
                            <button
                                onClick={() => remove(id)}
                                className="text-red-400 hover:text-red-300 px-1"
                            >✕</button>
                        </div>
                    )
                })}
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs opacity-60">{order.length}/{MAX_TEAM} selected</span>
                <div className="flex items-center gap-2">
                    {savedMsg && <span className="text-xs opacity-70">{savedMsg}</span>}
                    <button
                        onClick={save}
                        disabled={saving}
                        className="rounded-xl px-4 py-1 text-black bg-green-600 hover:bg-green-800 disabled:opacity-50"
                    >
                        {saving ? '...' : 'Save team'}
                    </button>
                </div>
            </div>

            {/* bench: owned pets not in the team */}
            <div className="border-t border-white/10 pt-3">
                <h3 className="text-sm opacity-70 mb-2">Available pets</h3>
                <div className="max-h-72 overflow-auto flex flex-col gap-1">
                    {bench.length === 0 && (
                        <p className="opacity-60 text-sm">No spare pets — open a lootbox!</p>
                    )}
                    {bench.map(p => {
                        const s = meta.get(p.speciesId)
                        const stats = statsFor(p.xp, s)
                        const rarity = s?.rarity ?? 'common'
                        const full = order.length >= MAX_TEAM
                        return (
                            <button
                                key={p.instanceId}
                                onClick={() => add(p.instanceId)}
                                disabled={full}
                                className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/5 disabled:opacity-40 text-left"
                            >
                                <div style={spriteThumbStyle(spriteThumbUrl(s), 40)} />
                                <span className="flex-1 font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                                    {p.nickname ?? s?.displayName ?? p.speciesId}
                                </span>
                                <StatChips attack={stats.attack} health={stats.health} level={stats.level} />
                                <span className="text-xs opacity-50">{full ? '' : '+ add'}</span>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// shared stat-chips (also reused on PetInventory rows — see 6.7)
export function StatChips({
    attack, health, level,
}: { attack: number; health: number; level: number }) {
    return (
        <div className="flex gap-1 text-[10px] font-mono">
            <span className="px-1 rounded bg-red-500/20 text-red-300">⚔ {attack}</span>
            <span className="px-1 rounded bg-emerald-500/20 text-emerald-300">❤ {health}</span>
            <span className="px-1 rounded bg-amber-500/20 text-amber-300">L{level}</span>
        </div>
    )
}
```

### 6.5 `MergePanel` — feed duplicates (c)

Groups the inventory by species so duplicates are obvious. You pick a **base** (the target that keeps its identity and gains xp) and a **same-species duplicate** to sacrifice, see the resulting `level`/`atk`/`hp` preview, then **Feed** via `useBattle().merge`. The base is disabled when it's already maxed (`xp >= 5`). A short level-up flash plays on success, then we refetch the inventory (the sacrifice is gone, the base bumped). The panel only needs the success boolean and the refetch — it does not read the merge payload's stats directly (the refetch re-derives them) — so the `{ target }` shape change is transparent here.

```tsx
// client/src/modules/pets/components/MergePanel.tsx
import { useEffect, useMemo, useState } from 'react'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { useBattleContext } from '../contexts/BattleContext'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { PetInstance, SpeciesEntry } from '../models/pet'

function levelFor(xp: number) {
    return xp < 2 ? 1 : xp < 5 ? 2 : 3
}

export function MergePanel() {
    const { inventory, refetch } = usePetInventoryContext()
    const { merge } = useBattleContext()
    const { species } = usePetSpecies()

    const meta = useMemo(() => {
        const map = new Map<string, SpeciesEntry>()
        for (const s of species) map.set(s.speciesId, s)
        return map
    }, [species])

    // Group owned instances by species so duplicates are obvious.
    const groups = useMemo(() => {
        const map = new Map<string, PetInstance[]>()
        for (const p of inventory) {
            const arr = map.get(p.speciesId) ?? []
            arr.push(p)
            map.set(p.speciesId, arr)
        }
        // Only species the user has 2+ of can be merged.
        return [...map.entries()].filter(([, arr]) => arr.length >= 2)
    }, [inventory])

    const [baseId, setBaseId] = useState<string | null>(null)
    const [sacrificeId, setSacrificeId] = useState<string | null>(null)
    const [feeding, setFeeding] = useState(false)
    const [flash, setFlash] = useState(false)
    const [errMsg, setErrMsg] = useState<string | null>(null)

    const base = inventory.find(p => p.instanceId === baseId) ?? null
    const sacrifice = inventory.find(p => p.instanceId === sacrificeId) ?? null
    const baseSpecies = base ? meta.get(base.speciesId) : undefined

    // Clear a stale selection if the underlying pet vanished (e.g. post-merge).
    useEffect(() => {
        if (baseId && !inventory.some(p => p.instanceId === baseId)) setBaseId(null)
        if (sacrificeId && !inventory.some(p => p.instanceId === sacrificeId)) setSacrificeId(null)
    }, [inventory, baseId, sacrificeId])

    const baseMaxed = base ? base.xp >= 5 : false

    // Preview: target gains exactly +1 xp (capped at 5).
    const previewXp = base ? Math.min(5, base.xp + 1) : 0
    const previewAttack = baseSpecies ? baseSpecies.baseAttack + previewXp : 0
    const previewHealth = baseSpecies ? baseSpecies.baseHealth + previewXp : 0

    const canFeed =
        !!base && !!sacrifice &&
        base.instanceId !== sacrifice.instanceId &&
        base.speciesId === sacrifice.speciesId &&
        !baseMaxed

    const feed = async () => {
        if (!canFeed || !base || !sacrifice) return
        try {
            setFeeding(true)
            setErrMsg(null)
            await merge(base.instanceId, sacrifice.instanceId)
            setFlash(true)
            setSacrificeId(null)
            await refetch()
            setTimeout(() => setFlash(false), 700)
        } catch (err) {
            setErrMsg((err as Error).message)
        } finally {
            setFeeding(false)
        }
    }

    return (
        <div className="flex flex-col gap-4 p-4 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-semibold text-center">Merge pets</h2>
            <p className="text-xs opacity-60 text-center">
                Feed a duplicate into a base of the same species. 3 copies → level 2, 6 copies → level 3.
            </p>

            {groups.length === 0 && (
                <p className="opacity-60 text-sm text-center py-4">
                    You need two of the same species to merge.
                </p>
            )}

            <div className="max-h-72 overflow-auto flex flex-col gap-3">
                {groups.map(([speciesId, dupes]) => {
                    const s = meta.get(speciesId)
                    const rarity = s?.rarity ?? 'common'
                    return (
                        <div key={speciesId} className="border rounded-lg p-2" style={{ borderColor: RARITY_COLOR[rarity] }}>
                            <div className="flex items-center gap-2 mb-2">
                                <div style={spriteThumbStyle(spriteThumbUrl(s), 32)} />
                                <span className="font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                                    {s?.displayName ?? speciesId}
                                </span>
                                <span className="text-xs opacity-50">×{dupes.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {dupes.map(p => {
                                    const isBase = p.instanceId === baseId
                                    const isSac = p.instanceId === sacrificeId
                                    const maxed = p.xp >= 5
                                    return (
                                        <div key={p.instanceId} className="flex flex-col items-center">
                                            <span
                                                className={`text-[10px] px-2 py-0.5 rounded ${
                                                    isBase ? 'bg-amber-500/30' : isSac ? 'bg-red-500/30' : 'bg-white/5'
                                                }`}
                                            >
                                                L{levelFor(p.xp)} · xp {p.xp}
                                            </span>
                                            <div className="flex gap-1 mt-1">
                                                <button
                                                    onClick={() => setBaseId(p.instanceId)}
                                                    disabled={maxed}
                                                    title={maxed ? 'Already max level' : 'Use as base'}
                                                    className={`text-[10px] px-1 rounded border disabled:opacity-30 ${
                                                        isBase ? 'bg-amber-600 text-black' : ''
                                                    }`}
                                                >base</button>
                                                <button
                                                    onClick={() => setSacrificeId(p.instanceId)}
                                                    className={`text-[10px] px-1 rounded border ${
                                                        isSac ? 'bg-red-600 text-black' : ''
                                                    }`}
                                                >feed</button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* preview + feed action */}
            {base && (
                <div
                    className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"
                    style={{
                        boxShadow: flash ? `0 0 28px ${RARITY_COLOR[baseSpecies?.rarity ?? 'common']}` : undefined,
                        transition: 'box-shadow .25s',
                    }}
                >
                    <div className="flex items-center gap-2">
                        <div
                            style={spriteThumbStyle(spriteThumbUrl(baseSpecies), 40)}
                            className={flash ? 'animate-pulse' : ''}
                        />
                        <div className="text-xs">
                            <div className="opacity-70">{baseSpecies?.displayName}</div>
                            {baseMaxed ? (
                                <div className="text-amber-300">Max level (L3)</div>
                            ) : (
                                <div>
                                    L{levelFor(base.xp)} → <span className="text-amber-300">L{levelFor(previewXp)}</span>
                                    {'  '}⚔ {baseSpecies ? baseSpecies.baseAttack + base.xp : 0}→{previewAttack}
                                    {'  '}❤ {baseSpecies ? baseSpecies.baseHealth + base.xp : 0}→{previewHealth}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {errMsg && <span className="text-xs text-red-400">{errMsg}</span>}
                        <button
                            onClick={feed}
                            disabled={!canFeed || feeding}
                            className="rounded-xl px-4 py-1 text-black bg-green-600 hover:bg-green-800 disabled:opacity-50"
                        >
                            {feeding ? '...' : 'Feed'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
```

### 6.6 Launcher + mount (d)

A fixed-position **Battle** button (mirrors the `Pets` fixed-overlay pattern) that `openModal()`s a panel. The panel hosts the `TeamBuilder`, a **Fight** button (calls `fight()`, then `openModal()`s `BattleArena` with the response), and a tab to the `MergePanel`. It shows the current ladder line (`trophies`/`streak`/`points`).

```tsx
// client/src/modules/pets/components/BattleLauncher.tsx
import { useState } from 'react'
import { useModal } from '../../../components/modal/ModalContext'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { useBattleContext } from '../contexts/BattleContext'
import { TeamBuilder } from './TeamBuilder'
import { MergePanel } from './MergePanel'
import { BattleArena } from './BattleArena'

// Fixed launcher button — mirrors how <Pets/> mounts a fixed overlay.
export function BattleLauncher() {
    const { openModal } = useModal()

    return (
        <button
            onClick={() => openModal(<BattlePanel />)}
            className="fixed bottom-4 right-4 z-[60] rounded-full px-5 py-3 text-black font-bold bg-amber-400 hover:bg-amber-300 shadow-lg pointer-events-auto"
        >
            ⚔ Battle
        </button>
    )
}

type Tab = 'team' | 'merge'

function BattlePanel() {
    const { openModal } = useModal()
    const { profile, fight } = useBattleContext()
    const { points } = usePointsContext()
    const [tab, setTab] = useState<Tab>('team')
    const [fighting, setFighting] = useState(false)
    const [errMsg, setErrMsg] = useState<string | null>(null)

    const startFight = async () => {
        try {
            setFighting(true)
            setErrMsg(null)
            const result = await fight()
            // Hand off to the arena (replaces this panel in the modal slot).
            openModal(<BattleArena fight={result} />)
        } catch (err) {
            setErrMsg((err as Error).message)
        } finally {
            setFighting(false)
        }
    }

    return (
        <div className="flex flex-col gap-3 p-4 rounded-xl [background:var(--bg)] border min-w-[480px] max-w-[560px]">
            {/* ladder header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Arena</h2>
                <div className="flex gap-3 text-sm">
                    <span>🏆 {profile?.trophies ?? 0}</span>
                    <span>🔥 {profile?.streak ?? 0}</span>
                    <span className="opacity-70">Points: {points ?? '—'}</span>
                </div>
            </div>

            {/* tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setTab('team')}
                    className={`rounded-xl px-3 py-1 text-sm ${tab === 'team' ? 'bg-white/10' : 'opacity-60'}`}
                >Team</button>
                <button
                    onClick={() => setTab('merge')}
                    className={`rounded-xl px-3 py-1 text-sm ${tab === 'merge' ? 'bg-white/10' : 'opacity-60'}`}
                >Merge</button>
            </div>

            {tab === 'team' ? <TeamBuilder /> : <MergePanel />}

            {/* fight action */}
            <div className="flex items-center justify-between border-t border-white/10 pt-3">
                {errMsg ? (
                    <span className="text-xs text-red-400">{errMsg}</span>
                ) : (
                    <span className="text-xs opacity-60">Front pet fights first. Win for points + trophies.</span>
                )}
                <button
                    onClick={startFight}
                    disabled={fighting}
                    className="rounded-xl px-5 py-2 text-black font-bold bg-red-500 hover:bg-red-400 disabled:opacity-50"
                >
                    {fighting ? 'Fighting…' : 'Fight!'}
                </button>
            </div>
        </div>
    )
}
```

**Exact `App.tsx` mount.** Add the `BattleProvider` inside the existing provider stack (it depends on the session, which `UserProvider` supplies, and on `PetInventoryProvider`/`PointsProvider` being available to the launcher's children). Mount `<BattleLauncher/>` right next to `<Pets/>`:

```tsx
// client/src/App.tsx
import Typing from './modules/typing'
import { SoundProvider } from './modules/sound/SoundContext'
import { ModalProvider } from './components/modal/ModalProvider'
import { UserProvider } from './utils/User/UserContext'
import { PointsProvider } from './modules/points/contexts/PointsContext'
import { ThemeProvider } from './utils/Theme/ThemeContext'
import { Pets } from './modules/pets'
import { PetInventoryProvider } from './modules/pets/contexts/PetInventoryContext'
import { BattleProvider } from './modules/pets/contexts/BattleContext'
import { BattleLauncher } from './modules/pets/components/BattleLauncher'

function App() {
    return (
        <UserProvider>
            <ThemeProvider>
                <SoundProvider>
                    <PointsProvider>
                        <PetInventoryProvider>
                            <BattleProvider>
                                <ModalProvider>
                                    <div className="relative overflow-hidden min-h-screen">
                                        <Pets />
                                        <BattleLauncher />
                                        <div className="flex items-center justify-center font-mono min-h-screen p-10">
                                            <Typing />
                                        </div>
                                    </div>
                                </ModalProvider>
                            </BattleProvider>
                        </PetInventoryProvider>
                    </PointsProvider>
                </SoundProvider>
            </ThemeProvider>
        </UserProvider>
    )
}

export default App
```

### 6.7 Stat-chips on existing `PetInventory` rows (e)

Drop the `StatChips` component (exported from `TeamBuilder.tsx`) into the existing inventory rows so attack/health/level show alongside each pet. This reuses the same species lookup the row already does and the `level`/`xp` now present on each `PetInstance`.

```tsx
// client/src/modules/pets/components/PetInventory.tsx (row, extended)
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { StatChips } from './TeamBuilder'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { Rarity } from '../models/pet'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'

export function PetInventory() {
    const { inventory, setActive, loading } = usePetInventoryContext()
    const { species } = usePetSpecies()
    const meta = (id: string) => species.find(s => s.speciesId === id)

    if (loading && inventory.length === 0) {
        return <p className="p-4 opacity-70">Loading…</p>
    }
    if (inventory.length === 0) {
        return <p className="p-4 opacity-70">No pets yet — open a lootbox!</p>
    }

    return (
        <div className="flex flex-col p-4 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-semibold text-center mb-1">Your pets ({inventory.length})</h2>
            <div className="max-h-100 overflow-auto">
            {inventory.map(p => {
                const s = meta(p.speciesId)
                const rarity: Rarity = s?.rarity ?? 'common'
                const level = p.xp < 2 ? 1 : p.xp < 5 ? 2 : 3
                const attack = (s?.baseAttack ?? 0) + p.xp
                const health = (s?.baseHealth ?? 0) + p.xp
                return (
                    <div key={p.instanceId} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div style={spriteThumbStyle(spriteThumbUrl(s), 32)} />
                        <span className="font-medium flex-1" style={{ color: RARITY_COLOR[rarity] }}>
                            {p.nickname ?? s?.displayName ?? p.speciesId}
                        </span>
                        <StatChips attack={attack} health={health} level={level} />
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
        </div>
    )
}
```

### 6.8 Playback summary (how the index-shift stays correct)

1. **Start.** `BattleArena` seeds `player.current`/`enemy.current` from the `start` event's snapshots (falling back to `playerTeam`/`enemyTeam`). Each tile gets a stable `key` minted from a monotonic counter; React keys by it, never by index. The line a pet belongs to is carried by React props on `ArenaLine`/`ArenaTile`, not by a `side` field on the snapshot (the server union has none).
2. **Stepper.** Events are scheduled back-to-back via `setTimeout`, each after the previous event's animation budget (`durationFor`). `playEvent` mutates the refs, then flushes `[...ref]` into state to trigger a repaint.
3. **Ability.** Each `BattleEffect` is applied to `line[effect.index]` — the position **at emit time** — and a floating popup (`floatup` keyframe) shows the ability name plus per-target `±atk`/`±hp`. `on_hurt` ability events (e.g. adrenaline) are emitted **immediately when they fire**, which is *before* the `attack` event of that clash — the client applies their `dAttack` to `line[effect.index]` exactly as it arrives; since they only change attack (not `playerHealthAfter`/`enemyHealthAfter`), the ordering is purely cosmetic.
4. **Attack.** The two fronts (`line[0]`) take their `*HealthAfter` values, lunge toward the enemy (mirrored via `scaleX(-1)` for the enemy line), and flash red if they took damage.
5. **Faint → index shift.** A `faint` fades `line[index]` out, then `splice`s it after the fade. Because the array shrinks, every pet behind shifts to a lower index — exactly matching the server's convention — and the *next* event's indices are interpreted against the already-shifted array.
6. **Summon.** A `summon` `splice`s a fresh `ArenaPet` in at `index` (the fainter's old front slot) with a pop-in scale; `second_wind` revives show up purely as the absence of a faint (the server simply doesn't emit one).
7. **End.** The `end` event triggers `settle()` → shows the WIN/LOSS/DRAW banner with `reward`/`trophiesAfter`/`streakAfter`/`pointsRemaining` (an int), then refetches points and inventory.
8. **Reduced motion.** When `prefers-reduced-motion: reduce` is set, the effect applies **every** event with `snap = true` (no timers, no transient flags, `splice` faints immediately) and jumps straight to the banner — same final board, zero animation.

---

## 7. Content, balance & tuning

This section is **data, not logic**. Every number here lives in `pet_species.config` (so it reaches the client for free via the existing `**s.config` spread in `/pets/species`) and is consumed by the deterministic simulator from section 5. The stat formulas (`attack = baseAttack + xp`, `health = baseHealth + xp`, `magnitude_eff = special.magnitude * level`) are authoritative and identical on client and server, so balancing the game is *entirely* a matter of editing the tables below — no code changes.

### 7a. Rarity budgets & the special tier table

Every species gets a **base stat budget** from its rarity (`baseAttack + baseHealth`). A species MAY redistribute its budget for personality flavor (glass-cannon, tank), but must keep `attack >= 1`, `health >= 1`, and stay on (or within ±1 of) the budget. Commons have `special: null`.

**Rarity base-stat table** (defaults; `baseAttack / baseHealth`):

| rarity      | baseAttack | baseHealth | budget | special |
|-------------|-----------:|-----------:|-------:|---------|
| `common`    | 2          | 3          | 5      | none (`null`) |
| `uncommon`  | 3          | 4          | 7      | tier 1, magnitude 1 |
| `rare`      | 4          | 5          | 9      | tier 2, magnitude 2 |
| `epic`      | 5          | 7          | 12     | tier 3, magnitude 3 |
| `legendary` | 6          | 9          | 15     | tier 4, magnitude 4 |

**Special tier / magnitude table.** A special's *effective* magnitude in battle is `magnitude * level`, so the same special scales with merge-leveling (1 → 2 → 3). `tier` is purely descriptive (it documents which rarity bracket the ability was budgeted for); only `magnitude` is read by the simulator.

| tier | intended rarity | base magnitude | effective at L1 / L2 / L3 |
|-----:|-----------------|---------------:|---------------------------|
| 1    | uncommon        | 1              | 1 / 2 / 3 |
| 2    | rare            | 2              | 2 / 4 / 6 |
| 3    | epic            | 3              | 3 / 6 / 9 |
| 4    | legendary       | 4              | 4 / 8 / 12 |

The `special` object stored in config carries **all five** fields, including `tier` and `magnitude`. This is the **species-level** special — the `PetSpecial` type (`{ id, name, description, tier, magnitude }`) defined in `client/src/modules/pets/models/pet.ts`, which the client receives via the `**s.config` spread on `SpeciesEntry`. The **snapshot-level** special carried by `PetSnapshot.special` / `TeamPet.special` is the trimmed `SnapshotSpecial` type (`{ id, name, description }`, defined in `client/src/modules/pets/models/battle.ts`); the server strips `tier`/`magnitude` out when building snapshots, but the simulator reads them straight from config. These are two distinct types — there is exactly one `PetSpecial` (in `pet.ts`, with `tier`+`magnitude`) and one `SnapshotSpecial` (in `battle.ts`, without them); `battle.ts` must not redefine `PetSpecial`, and `pet.ts` must not import it from `battle.ts`.

```jsonc
// shape of pet_species.config.special  (null for commons) — the species-level PetSpecial
{
  "id": "recoil_blast",          // matches an entry in the ability catalog (7c)
  "name": "Recoil Blast",        // surfaced trimmed in PetSnapshot.special.name
  "description": "...",          // surfaced trimmed in PetSnapshot.special.description
  "tier": 3,                     // descriptive; budgeting bracket (stripped from snapshot)
  "magnitude": 3                 // simulator: effective = magnitude * level (stripped from snapshot)
}
```

### 7b. Battle-config additions for all 11 roster species

Each block below is the **JSON to merge into that species' existing `pet_species.config`** (alongside the existing `behaviorBag` / `animations` / `behaviorWeights`). Stats are tuned to the rarity budget *and* the pet's personality:

- `cat` / `stick_figure` / `semicolon` — vanilla commons, no special.
- `pet_rock` — **tank common**: redistribute the 5 budget to 1/4 (it barely hits, but it eats hits). No special (commons get none).
- `rubber_duck` — uncommon support: `pep_talk` (buffs the duck behind it — "debugging buddy").
- `coffee_mug` — uncommon aggro: `adrenaline` (caffeine spike; gains attack each time it's hurt). Budget skewed to attack (4/3).
- `desk_gun` — **glass-cannon rare**: 7/2 (way over on attack, near-zero health) with `recoil_blast` (epic ability granted early for flavor — it's a *gun*; budget kept at 9 total to stay rare-legal).
- `ghost_404` — rare trickster: `snipe` (start-of-battle, hits the lowest-health enemy — "404: pet not found").
- `bonk_hammer` — epic bruiser: `summon_token` on faint (the hammer shatters into a shard that keeps swinging). Balanced 6/6.
- `disco_ball` — epic party buff: disco buffs *everyone*, so it uses `jackpot` (normally legendary) but at epic magnitude 3 to stay budget-legal. Balanced 5/7.
- `loot_goblin` — **legendary**: `jackpot` at full magnitude 4 — start-of-battle, pumps the whole team (the goblin "drops loot" on its allies).

```json
// merge into pet_species.config for species_id = 'cat'
{ "baseAttack": 2, "baseHealth": 3, "special": null }
```

```json
// merge into pet_species.config for species_id = 'stick_figure'
{ "baseAttack": 2, "baseHealth": 3, "special": null }
```

```json
// merge into pet_species.config for species_id = 'semicolon'
{ "baseAttack": 2, "baseHealth": 3, "special": null }
```

```json
// merge into pet_species.config for species_id = 'pet_rock'  (tank common: 1/4)
{ "baseAttack": 1, "baseHealth": 4, "special": null }
```

```json
// merge into pet_species.config for species_id = 'rubber_duck'  (uncommon support)
{
  "baseAttack": 3,
  "baseHealth": 4,
  "special": {
    "id": "pep_talk",
    "name": "Rubber Duck Debugging",
    "description": "Start of battle: the ally directly behind gains +m attack and +m health.",
    "tier": 1,
    "magnitude": 1
  }
}
```

```json
// merge into pet_species.config for species_id = 'coffee_mug'  (uncommon aggro: 4/3)
{
  "baseAttack": 4,
  "baseHealth": 3,
  "special": {
    "id": "adrenaline",
    "name": "Caffeine Spike",
    "description": "When hurt and surviving: permanently gain +m attack.",
    "tier": 1,
    "magnitude": 1
  }
}
```

```json
// merge into pet_species.config for species_id = 'desk_gun'  (glass-cannon rare: 7/2)
{
  "baseAttack": 7,
  "baseHealth": 2,
  "special": {
    "id": "recoil_blast",
    "name": "Recoil Blast",
    "description": "Before attacking: also deal m splash damage to the enemy directly behind the front.",
    "tier": 2,
    "magnitude": 2
  }
}
```

```json
// merge into pet_species.config for species_id = 'ghost_404'  (rare trickster)
{
  "baseAttack": 4,
  "baseHealth": 5,
  "special": {
    "id": "snipe",
    "name": "404: Pet Not Found",
    "description": "Start of battle: deal 2*m damage to the enemy with the lowest current health.",
    "tier": 2,
    "magnitude": 2
  }
}
```

```json
// merge into pet_species.config for species_id = 'bonk_hammer'  (epic bruiser: 6/6)
{
  "baseAttack": 6,
  "baseHealth": 6,
  "special": {
    "id": "summon_token",
    "name": "Shatterstrike",
    "description": "On faint: summon a (2*level)/(2*level) shard at the front of this line.",
    "tier": 3,
    "magnitude": 3
  }
}
```

```json
// merge into pet_species.config for species_id = 'disco_ball'  (epic party: 5/7)
{
  "baseAttack": 5,
  "baseHealth": 7,
  "special": {
    "id": "jackpot",
    "name": "Disco Fever",
    "description": "Start of battle: give ALL allies +m attack and +ceil(m/2) health.",
    "tier": 3,
    "magnitude": 3
  }
}
```

```json
// merge into pet_species.config for species_id = 'loot_goblin'  (legendary jackpot: 6/9)
{
  "baseAttack": 6,
  "baseHealth": 9,
  "special": {
    "id": "jackpot",
    "name": "Drop the Loot",
    "description": "Start of battle: give ALL allies +m attack and +ceil(m/2) health.",
    "tier": 4,
    "magnitude": 4
  }
}
```

#### Concrete example: the final merged `loot_goblin` config

This is the *entire* `config` JSON after merging the battle keys into the existing `loot_goblin` seed row. The `behaviorBag` and `animations` are quoted **verbatim from the current `loot_goblin` row in `seed_pet_species.sql`** (`["idle","flee_cursor","flee_cursor","wander","sleep"]`); only `baseAttack` / `baseHealth` / `special` are added:

```json
{
  "behaviorBag": ["idle", "flee_cursor", "flee_cursor", "wander", "sleep"],
  "animations": {
    "idle":        { "frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 4 },
    "flee_cursor": { "frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 12 },
    "wander":      { "frameWidth": 64, "frameHeight": 64, "frames": 6, "fps": 7 },
    "sleep":       { "frameWidth": 64, "frameHeight": 64, "frames": 4, "fps": 2 }
  },
  "baseAttack": 6,
  "baseHealth": 9,
  "special": {
    "id": "jackpot",
    "name": "Drop the Loot",
    "description": "Start of battle: give ALL allies +m attack and +ceil(m/2) health.",
    "tier": 4,
    "magnitude": 4
  }
}
```

#### Seed note (regenerate, don't hand-edit generated files)

The 11 base species are seeded by `fastapi-server/seeds/seed_pet_species.sql`. The 4 bonus boxes (40 pets) are **generated** into `fastapi-server/seeds/custom/seed_custom_pet_species.sql` by `tools/sprite_forge/build_seeds.py` and are explicitly marked *do not hand-edit*. To keep both consistent, the battle keys go into the **JSON source of truth**, then the seeds are regenerated:

1. Add `baseAttack` / `baseHealth` / `special` to each pet's spec object in the `tools/sprite_forge/pets/*.json` files (for the base roster, `base_pets.json`; for bonus pets, their box file).
2. Extend `build_seeds.py`'s `species_config(spec)` so the keys are emitted into `config` (one added block — see 7f), then run:

   ```bash
   python tools/sprite_forge/build_seeds.py
   ```

   which rewrites `seed_custom_pet_species.sql`.
3. For the **base** roster, `seed_pet_species.sql` is currently hand-maintained (it is not produced by `build_seeds.py`, whose `BOXES` list covers only the 4 bonus boxes). The minimal, idempotent path is to fold the new keys into each `config` literal in that file. Because the seed uses `ON CONFLICT (species_id) DO NOTHING`, an already-seeded row is **not** overwritten on re-run; to apply the battle keys to a live DB, issue an explicit `UPDATE` rather than relying on the `INSERT`:

   ```sql
   -- fastapi-server/seeds/seed_pet_species.sql  (battle-stat backfill — append below the INSERT)
   -- Backfills baseAttack/baseHealth/special into existing rows. Re-running is safe:
   -- jsonb concat (||) overwrites only these keys and leaves behaviorBag/animations intact.
   BEGIN;
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'cat';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'stick_figure';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":2,"baseHealth":3,"special":null}'::jsonb)::json WHERE species_id = 'semicolon';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":1,"baseHealth":4,"special":null}'::jsonb)::json WHERE species_id = 'pet_rock';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":3,"baseHealth":4,"special":{"id":"pep_talk","name":"Rubber Duck Debugging","description":"Start of battle: the ally directly behind gains +m attack and +m health.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'rubber_duck';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":3,"special":{"id":"adrenaline","name":"Caffeine Spike","description":"When hurt and surviving: permanently gain +m attack.","tier":1,"magnitude":1}}'::jsonb)::json WHERE species_id = 'coffee_mug';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":7,"baseHealth":2,"special":{"id":"recoil_blast","name":"Recoil Blast","description":"Before attacking: also deal m splash damage to the enemy directly behind the front.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'desk_gun';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":4,"baseHealth":5,"special":{"id":"snipe","name":"404: Pet Not Found","description":"Start of battle: deal 2*m damage to the enemy with the lowest current health.","tier":2,"magnitude":2}}'::jsonb)::json WHERE species_id = 'ghost_404';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":6,"special":{"id":"summon_token","name":"Shatterstrike","description":"On faint: summon a (2*level)/(2*level) shard at the front of this line.","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'bonk_hammer';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":5,"baseHealth":7,"special":{"id":"jackpot","name":"Disco Fever","description":"Start of battle: give ALL allies +m attack and +ceil(m/2) health.","tier":3,"magnitude":3}}'::jsonb)::json WHERE species_id = 'disco_ball';
   UPDATE pet_species SET config = (config::jsonb || '{"baseAttack":6,"baseHealth":9,"special":{"id":"jackpot","name":"Drop the Loot","description":"Start of battle: give ALL allies +m attack and +ceil(m/2) health.","tier":4,"magnitude":4}}'::jsonb)::json WHERE species_id = 'loot_goblin';
   COMMIT;
   ```

### 7c. Ability catalog

All nine abilities are the bounded set the simulator dispatches on (`start_of_battle`, `before_attack`, `on_hurt`, `on_faint`). `m` is the *effective* magnitude (`special.magnitude * level`). Every random choice is resolved by the seeded rng so the whole sim is reproducible.

| id              | trigger           | rarity bracket | effect (at effective magnitude `m`) | flavor |
|-----------------|-------------------|----------------|-------------------------------------|--------|
| `pep_talk`      | `start_of_battle` | uncommon       | Ally directly BEHIND this pet gains **+m attack** and **+m health**. | "Have you tried explaining it to the rubber duck?" |
| `splash_damage` | `on_faint`        | uncommon       | Deal **m** damage to the current enemy front pet. | Goes out with a mess. |
| `adrenaline`    | `on_hurt`         | rare           | Permanently **+m attack** (applies to later clashes). Fires every time it is hurt and survives. | Pain is fuel. |
| `snipe`         | `start_of_battle` | rare           | Deal **2*m** damage to the enemy pet with the LOWEST current health (tie → frontmost). | "404: pet not found." |
| `recoil_blast`  | `before_attack`   | epic           | In addition to the normal attack, deal **m** splash to the enemy directly BEHIND the enemy front (if any). | The kickback hits the guy in the back. |
| `summon_token`  | `on_faint`        | epic           | Summon a token pet with stats **(2*level)/(2*level)** into this line at the front. | Death is just a respawn. |
| `jackpot`       | `start_of_battle` | legendary      | Give ALL allies **+m attack** and **+ceil(m/2) health**. | Everybody eats. |
| `second_wind`   | `on_faint`        | legendary      | The FIRST time this pet would faint, instead revive at **ceil(maxHealth/2)** health (once per battle). | It's not dead, it's resting. |
| `guard_stance`  | `start_of_battle` | epic           | Give the ally in FRONT (toward index 0) **+m health**; if it is already the front pet, give itself **+m health**. | Holds the line. |

> Note on assignment: of the nine catalog abilities, the base roster (7b) uses `pep_talk`, `adrenaline`, `recoil_blast`, `snipe`, `summon_token`, and `jackpot`. The remaining three — `splash_damage`, `second_wind`, `guard_stance` — are reserved for the 40 bonus-box pets (assigned in their `tools/sprite_forge/pets/*.json` specs via the same pipeline as 7f) so every catalog entry ships on at least one species.

### 7d. Enemy scaling

The PvE opponent is generated deterministically from `(tier, server_seed)`, where `tier = trophies`. The four scalers (restated from spec):

- **team size** = `min(5, 1 + tier // 2)`
- **flat stat bonus** (added to each enemy pet's attack AND health) = `tier // 3`
- **enemy pet level** (drives ability magnitude + merge-style stat bumps; `attack = baseAttack + (level-1)`, `health = baseHealth + (level-1)`) = `min(3, 1 + tier // 4)`
- **rarity weights** shift toward higher rarity as tier grows; picks are drawn from the full enabled roster via the seeded rng.

**Worked scaling table** (per tier):

| tier | team size | flat bonus | enemy level | rarity weights (common / uncommon / rare / epic / legendary) |
|-----:|----------:|-----------:|------------:|--------------------------------------------------------------|
| 0    | 1         | 0          | 1           | 70 / 25 / 5 / 0 / 0 |
| 1    | 1         | 0          | 1           | 65 / 27 / 7 / 1 / 0 |
| 2    | 2         | 0          | 1           | 60 / 28 / 9 / 2 / 1 |
| 3    | 2         | 1          | 1           | 52 / 30 / 12 / 4 / 2 |
| 4    | 3         | 1          | 2           | 45 / 30 / 16 / 6 / 3 |
| 6    | 4         | 2          | 2           | 35 / 28 / 21 / 11 / 5 |
| 8    | 5         | 2          | 3           | 25 / 25 / 25 / 17 / 8 |
| 10   | 5         | 3          | 3           | 18 / 22 / 27 / 22 / 11 |
| 12+  | 5         | 4          | 3           | 12 / 18 / 28 / 27 / 15 |

The weight rows above are the reference curve. There is **one** implementation of this curve — `_rarity_weights(tier)` in `app/utils/battle_enemy.py` (the engine module from section 5; do **not** add a second copy elsewhere). It encodes the rows as a closed-form function of `tier` (common decays, epic/legendary grow), clamped at the `12+` row so every weight stays `>= 0` and the distribution shifts smoothly toward higher rarity. For reference, the closed form folded into that function is:

```python
# app/utils/battle_enemy.py  (this is the SAME _rarity_weights used by the enemy builder — not a new module)
def _rarity_weights(tier: int) -> dict[str, int]:
    """Deterministic rarity weights for enemy species picks at a given tier.

    Common decays with tier; epic/legendary ramp in. Clamped so every weight
    stays >= 0 and the distribution shifts smoothly toward higher rarity.
    """
    t = max(0, tier)
    return {
        "common": max(10, 70 - 5 * t),
        "uncommon": max(15, 25 + min(t, 4)),
        "rare": min(28, 5 + 2 * t),
        "epic": min(27, max(0, 2 * (t - 1))),
        "legendary": min(15, max(0, t - 1)),
    }
```

**Three example enemy teams** (deterministic given the printed seed; stats shown as `attack/health` *after* flat bonus and level bumps):

*Low tier — `tier = 1`* (size 1, bonus 0, level 1):

| slot | species | rarity | base | +level | +bonus | final atk/hp | special @ L1 |
|-----:|---------|--------|------|-------:|-------:|--------------|--------------|
| 0 (front) | `cat` | common | 2/3 | +0 | +0 | **2/3** | — |

*Mid tier — `tier = 5`* (size 3, bonus 1, level 2):

| slot | species | rarity | base | +level (L2: +1) | +bonus (+1) | final atk/hp | special @ L2 (m=magnitude*2) |
|-----:|---------|--------|------|-----------------|-------------|--------------|------------------------------|
| 0 (front) | `desk_gun`   | rare     | 7/2 | 8/3 | **9/4** | `recoil_blast` m=4 |
| 1         | `rubber_duck`| uncommon | 3/4 | 4/5 | **5/6** | `pep_talk` m=2 |
| 2 (back)  | `cat`        | common   | 2/3 | 3/4 | **4/5** | — |

*High tier — `tier = 10`* (size 5, bonus 3, level 3):

| slot | species | rarity | base | +level (L3: +2) | +bonus (+3) | final atk/hp | special @ L3 (m=magnitude*3) |
|-----:|---------|--------|------|-----------------|-------------|--------------|------------------------------|
| 0 (front) | `loot_goblin` | legendary | 6/9 | 8/11  | **11/14** | `jackpot` m=12 |
| 1         | `disco_ball`  | epic      | 5/7 | 7/9   | **10/12** | `jackpot` m=9  |
| 2         | `bonk_hammer` | epic      | 6/6 | 8/8   | **11/11** | `summon_token` (token 6/6) |
| 3         | `ghost_404`   | rare      | 4/5 | 6/7   | **9/10**  | `snipe` 2*m = 12 |
| 4 (back)  | `coffee_mug`  | uncommon  | 4/3 | 6/5   | **9/8**   | `adrenaline` m=3 |

### 7e. Reward formula & economy loop

Reward is the points **faucet**. Streak is evaluated *after* its increment on a win (so a win taking your streak to 3 uses `streak = 3`). Restated:

| result | reward formula | example inputs | payout |
|--------|----------------|----------------|-------:|
| win    | `min(300, 30 + tier*5 + streak*5)` | tier 0, streak 1 | **35** |
| win    | `min(300, 30 + tier*5 + streak*5)` | tier 5, streak 3 | **70** |
| win    | `min(300, 30 + tier*5 + streak*5)` | tier 10, streak 6 | **110** |
| win    | `min(300, 30 + tier*5 + streak*5)` | tier 20, streak 12 | **190** |
| win    | `min(300, 30 + tier*5 + streak*5)` | tier 40, streak 20 | **300** (capped) |
| draw   | `10` (flat) | any | **10** |
| loss   | `0` | any | **0** |

The reward is added to the user's points via the existing points CRUD **inside the same DB transaction** as the profile + battle-log write (so a battle either fully commits — points, trophies, log — or not at all; no faucet leak on a partial failure).

**Economy loop (faucet vs sink).** Battling pays out **0–300 points/fight**; lootboxes consume them:

- The standard boxes cost **50–666** points (the cheap/mid sink). A new player on a winning streak earns one in a fight or two; trophies and streak pull the average payout up over time, but the per-win cap of 300 keeps it from outrunning box prices.
- The **custom / `ai_slop`-tier boxes cost 50,000** points (the deep sink — `PRICE = 50000` in `build_seeds.py`, shared by all 4 bonus boxes). At a healthy ~100–200 points/win that is a multi-hundred-win grind, which is the intended long-tail goal that keeps the ladder relevant. Higher trophies → bigger payouts → faster boxes → more pets → better teams → higher trophies: the loop closes on itself, with the 300 cap and the trophy-loss-on-defeat as the two brakes that prevent runaway inflation.

### 7f. Giving a NEW species battle stats via the forge/seed pipeline

Battle stats are just three more keys in a pet's JSON spec; the forge carries them through to `config` automatically. To add a new battler:

1. In the pet's spec object inside `tools/sprite_forge/pets/<box>.json` (or `base_pets.json`), add `baseAttack`, `baseHealth`, and `special` (use `null` for a common):

   ```json
   {
     "behaviors": ["idle", "wander", "sleep"],
     "display_name": "Null Pointer",
     "rarity": "rare",
     "speed": 200,
     "baseAttack": 7,
     "baseHealth": 2,
     "special": {
       "id": "snipe",
       "name": "Segfault",
       "description": "Start of battle: deal 2*m damage to the enemy with the lowest current health.",
       "tier": 2,
       "magnitude": 2
     },
     "grid": ["................", "................"]
   }
   ```

2. Teach the generator to emit the three keys into `config`. This is the **only** code change — add the marked block to `species_config` in `build_seeds.py`:

   ```python
   # tools/sprite_forge/build_seeds.py  (replace the existing species_config)
   def species_config(spec):
       """The pet_species.config JSON: behaviorBag + per-behaviour animations
       + battle stats (baseAttack/baseHealth/special)."""
       bag = spec.get("bag") or spec.get("behaviors") or []
       anims = {}
       for b in behaviors_of(spec):
           frames, fps, _style = forge.BEHAVIOR_ANIM[b]
           anims[b] = {"frameWidth": 64, "frameHeight": 64, "frames": frames, "fps": fps}
       cfg = {"behaviorBag": bag, "animations": anims}
       # ---- battle stats: pass through to config so they reach the client via **s.config ----
       if "baseAttack" in spec:
           cfg["baseAttack"] = int(spec["baseAttack"])
       if "baseHealth" in spec:
           cfg["baseHealth"] = int(spec["baseHealth"])
       if "special" in spec:
           cfg["special"] = spec["special"]  # dict or null; emitted as-is
       return cfg
   ```

3. Regenerate and apply the seed:

   ```bash
   python tools/sprite_forge/build_seeds.py
   psql "$DATABASE_URL" -f fastapi-server/seeds/custom/seed_custom_pet_species.sql
   ```

   The new keys now land in `pet_species.config`, flow through the `**s.config` spread in `/pets/species`, and the species is immediately battle-ready — no server or client code changes, because the simulator and `PetSnapshot` read `baseAttack` / `baseHealth` / `special` straight from config.
