from dataclasses import dataclass
import math
from typing import Literal

type Rarity = Literal[
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
]

RARITY_VALUES: tuple[Rarity, ...]= (
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
)

@dataclass(frozen=True)
class EnemySpawn:
    chance: float
    level: int

RARITY_START_TIER: dict[Rarity, int] = {
    "common": 0,
    "uncommon": 5,
    "rare": 15,
    "epic": 25,
    "legendary": 35,
}

RARITY_LEVEL_RATE: dict[Rarity, float] = {
    "common": 0.25,
    "uncommon": 0.20,
    "rare": 0.15,
    "epic": 0.10,
    "legendary": 0.10
}

CENTER_OFFSET = 10

CENTER: dict[Rarity, int] = {
    rarity: start + CENTER_OFFSET
    for rarity, start in RARITY_START_TIER.items()
}

WIDTH: dict[Rarity, float] = {
    "common": 8,
    "uncommon": 10,
    "rare": 12,
    "epic": 14,
    "legendary": 18,
}


def rarity_level(rarity: Rarity, tier: int) -> int:
    start = RARITY_START_TIER[rarity]
    rate = RARITY_LEVEL_RATE[rarity]

    if tier < start:
        return 0
    
    return max(1, int((tier - start) * rate) + 1)

def rarity_chances(tier: int) -> dict[Rarity, float]:
    weights = {}

    for rarity in RARITY_VALUES:
        start = RARITY_START_TIER[rarity]

        if tier < start:
            weights[rarity] = 0
            continue

        width = WIDTH[rarity]

        weight = math.exp(-((tier - CENTER[rarity]) ** 2) / (2 * width**2))

        weights[rarity] = weight

    total = sum(weights.values())

    if total == 0:
        return weights
    
    return {
        rarity: weight / total for rarity, weight in weights.items()
    }

def generate_tier(tier: int) -> dict[Rarity, EnemySpawn]:
    chances = rarity_chances(tier)

    return {
        rarity: EnemySpawn(
            chance=chances[rarity],
            level=rarity_level(rarity, tier)
        ) for rarity in RARITY_VALUES
    }
