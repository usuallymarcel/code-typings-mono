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
