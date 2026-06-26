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


def species_special(species: Any, level: int) -> Optional[dict[str, Any]]:
    """Project a species' config special to the trimmed snapshot shape
    {id, name, description} (or None for commons). A thin public wrapper over
    _resolve_special, kept here so the projection lives in one place. `level` is
    accepted for signature stability (the snapshot special shape is level-agnostic;
    magnitude is stripped and applied in the simulator)."""
    config = getattr(species, "config", None) or {}
    resolved = _resolve_special(config, level)
    if resolved is None:
        return None
    return {
        "id": resolved["id"],
        "name": resolved["name"],
        "description": resolved["description"],
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
