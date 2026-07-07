import random
from app.utils.battle_engine import BattlePet, _resolve_special
from app.models.pet_species import Pet_Species

RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"]

def _rarity_weights(tier: int) -> dict[str, float]:
    weights: dict[str, float] = {}
    for rank, rarity in enumerate(RARITY_ORDER):
        base = max(0.0, 6.0 - 2.0 * rank)
        growth = rank * (tier / 4.0)
        weights[rarity] = base + growth
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

def build_enemy_team(tier: int, rng: random.Random, all_species: list[Pet_Species]) -> list[BattlePet]:
    size = 5
    stat_bonus = tier // 3
    level = 1 + (tier // 4)

    #build table of common: [pet, pet], uncommon: [pet] ..... 
    by_rarity: dict[str, list[Pet_Species]] = {r: [] for r in RARITY_ORDER}
    for s in all_species:
        if s.rarity in by_rarity:
            by_rarity[s.rarity].append(s)

    weights = _rarity_weights(tier)

    team: list[BattlePet] = []
    for _ in range(size):
        rarity = _weighted_pick_rarity(rng, weights)

        pool = by_rarity.get(rarity)

        if not pool:
            raise ValueError(f"no species for rarity {rarity}")

        species = pool[rng.randrange(len(pool))]

        config = species.config
        base_attack = int(config.get("baseAttack"))
        base_health = int(config.get("baseHealth"))

        attack = (base_attack * level) + stat_bonus
        health = (base_health * level) + stat_bonus

        team.append(BattlePet(
            instance_id=None,
            species_id=species.species_id,
            name=species.display_name,
            rarity=species.rarity,
            attack=attack,
            health=health,
            max_health=health,
            level=level,
            special=_resolve_special(config, level),
            flags={},
        ))

    return team

def reward_for(result: str, tier: int, streak_after: int) -> int:
    if result == "win":
        return 30 * (tier * 5) + (streak_after * 5) * 10
    if result == "draw":
        return (30 * (tier * 5) + (streak_after * 5) * 10) / 2
    return 0