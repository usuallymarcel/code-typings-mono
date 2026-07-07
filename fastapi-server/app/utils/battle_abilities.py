# fastapi-server/app/utils/battle_abilities.py
import math
import random
from dataclasses import dataclass, field
from typing import Literal, Callable

from app.utils.battle_engine import BattlePet, StatChangeEffect, snapshot

Effect = StatChangeEffect

@dataclass
class AbilityCtx:
    player: list[BattlePet]
    enemy: list[BattlePet]
    pet: BattlePet
    side: Literal["player", "enemy"]
    source_index: int
    rng: random.Random
    note: str | None = None
    # summons: list[dict[str, Any]] = field(default_factory=list)

    # --- line helpers --------------------------------------------------
    def own_line(self) -> list[BattlePet]:
        return self.player if self.side == "player" else self.enemy

    def enemy_line(self) -> list[BattlePet]:
        return self.enemy if self.side == "player" else self.player

    def enemy_side(self) -> Literal["player", "enemy"]:
        return "enemy" if self.side == "player" else "player"

    def magnitude(self) -> int:
        if self.pet.special is None:
            return 0
        return self.pet.special.magnitude

    def effect(
        self,
        side: Literal["player", "enemy"],
        index: int,
        d_health: int = 0,
        d_attack: int = 0,
    ) -> StatChangeEffect:
        effect: StatChangeEffect = {
            "type": "stat_change",
            "side": side,
            "index": index,
        }

        if d_health:
            effect["dHealth"] = d_health

        if d_attack:
            effect["dAttack"] = d_attack

        return effect


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


# # ---------------------------------------------------------------------------
# # summon_token (epic, on_faint):
# # summon a token pet with stats (2*level)/(2*level) into the fainter line at
# # the fainter position. We INSERT the token at the fainter's index + 1 (i.e.
# # directly BEHIND the still-present fainter). The engine then removes the
# # fainter by identity at the fainter's live index; the token shifts forward by
# # one and becomes the new front (or the new pet at the fainter's slot). This
# # keeps the faint index and the summon index self-consistent: the faint event
# # names the fainter's slot, the summon event names the token's slot at insert
# # time, and neither ever points at the other's tile.
# # ---------------------------------------------------------------------------
# def _summon_token(ctx: AbilityCtx) -> list[Effect]:
#     level = ctx.pet.level
#     stat = 2 * level
#     token = BattlePet(
#         instance_id=None,
#         species_id=ctx.pet.species_id,
#         display_name="Token",
#         rarity="common",
#         attack=stat,
#         health=stat,
#         max_health=stat,
#         level=1,
#         special=None,
#         flags={},
#         is_token=True,
#     )
#     line = ctx.own_line()
#     fainter_index = _index_of(line, ctx.pet)
#     insert_at = fainter_index + 1
#     line.insert(insert_at, token)
#     ctx.summons.append({
#         "type": "summon",
#         "side": ctx.side,
#         "index": insert_at,
#         "pet": snapshot(token),
#     })
#     return []


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

Trigger = Literal[
    "start_of_battle",
    "on_faint",
    "on_hurt",
    "before_attack",
]


@dataclass(frozen=True)
class AbilityEntry:
    trigger: Trigger
    apply: Callable[[AbilityCtx], list[Effect]]
# ---------------------------------------------------------------------------
# Registry keyed by ability id. trigger must match the SPEC catalog exactly.
# This registry is the SOLE source of an ability's trigger — config does NOT
# carry `trigger`; the engine looks it up here by id (see _trigger_of).
# ---------------------------------------------------------------------------
ABILITY: dict[str, AbilityEntry] = {
    "pep_talk": AbilityEntry("start_of_battle", _pep_talk),
    "splash_damage": AbilityEntry("on_faint", _splash_damage),
    "adrenaline": AbilityEntry("on_hurt", _adrenaline),
    "snipe": AbilityEntry("start_of_battle", _snipe),
    "recoil_blast": AbilityEntry("before_attack", _recoil_blast),
    "jackpot": AbilityEntry("start_of_battle", _jackpot),
    "second_wind": AbilityEntry("on_faint", _second_wind),
    "guard_stance": AbilityEntry("start_of_battle", _guard_stance),
}