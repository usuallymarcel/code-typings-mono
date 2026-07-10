import random
from app.utils.battle_engine import BattlePet, _resolve_special
from app.models.pet_species import Pet_Species
from app.utils.enemy_distribution import EnemySpawn, Rarity, generate_tier

#old
# base 6, 4, 2, 0, 0
# growth 0 * 1 / 4 = 0
# growth 1 * 1 / 4 = 0.25
# growth 2 * 1 / 4 = 0.5
# growth 3 * 1 / 4 = 0.75
# growth 4 * 1 / 4 = 1

# 6, 4.25, 2.5, 0.75, 1

#new
# base 12, 6, 1, 0, 0
# growth 0 * 1 / 6 = 0
# growth 1 * 1 / 6 = 0.167
# growth 2 * 1 / 6 = 0.33
# growth 3 * 1 / 6 = 0.5
# growth 4 * 1 / 6 = 0.667

# 6, 4.25, 2.5, 0.75, 1
RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"]

# def _rarity_weights(tier: int) -> dict[str, float]:
#     weights = {
#         "common": max(0.0, 12.0 - tier * 1.2),
#         "uncommon": max(0.0, 8.0 - max(0, tier - 5) * 0.8),
#         "rare": max(0.0, 2.0 + tier * 0.4),
#         "epic": max(0.0, 0.5 + tier * 0.7),
#         "legendary": max(0.0, tier * 0.8),
#     }


#     if tier >= 10:
#         weights["common"] = 0.0
#     if tier >= 15:
#         weights["uncommon"] = 0.0
#     if tier >= 30:
#         weights["rare"] = 0.0

#     # for rarity in RARITY_ORDER:
#     #     weights[rarity] += 0.5
    
#     return weights


def _weighted_pick_rarity(rng: random.Random, weights: dict[Rarity, EnemySpawn]) -> tuple[Rarity, EnemySpawn]:
    total = 0
    for spawn in weights.values():
        total += spawn.chance

    r = rng.random() * total

    acc = 0.0
    
    for rarity, spawn in weights.items():
        acc += spawn.chance
        if r < acc:
            return rarity, spawn
        
    assert False, "unreachable"

def build_enemy_team(tier: int, rng: random.Random, all_species: list[Pet_Species]) -> list[BattlePet]:
    size = 5
    # stat_bonus = tier // 3
    stat_bonus = 0
    level = 1 + (tier // 10)

    #build table of common: [pet, pet], uncommon: [pet] ..... 
    by_rarity: dict[Rarity, list[Pet_Species]] = {r: [] for r in RARITY_ORDER}
    for s in all_species:
        if s.rarity in by_rarity:
            by_rarity[s.rarity].append(s)

    weights = generate_tier(tier)

    team: list[BattlePet] = []
    for _ in range(size):
        rarity, spawn = _weighted_pick_rarity(rng, weights)

        pool = by_rarity.get(rarity)

        if not pool:
            raise ValueError("no enabled species available to build enemy team")

        species = pool[rng.randrange(len(pool))]

        config = species.config
        base_attack = int(config.get("baseAttack"))
        base_health = int(config.get("baseHealth"))

        attack = (base_attack * spawn.level) + stat_bonus
        health = (base_health * spawn.level) + stat_bonus

        team.append(BattlePet(
            instance_id=None,
            species_id=species.species_id,
            name=species.display_name,
            rarity=species.rarity,
            attack=attack,
            health=health,
            max_health=health,
            level=spawn.level,
            special=_resolve_special(config, spawn.level),
            flags={},
        ))

    return team

def reward_for(result: str, tier: int, streak_after: int) -> int:

    if result == "win":
        return 30 * (tier * 15) + (streak_after * 15) * 30
    if result == "draw":
        return (30 * (tier * 15) + (streak_after * 15) * 30) // 2
    return 0