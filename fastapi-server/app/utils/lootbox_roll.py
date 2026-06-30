import secrets

from app.models.lootbox import Lootbox

def roll(box: Lootbox) -> tuple[str, str]:

    rarities = box.drop_table["rarities"]

    roll = secrets.randbelow(sum(rarities.values()))

    acc = 0
    for rarity, weight in rarities.items():
        acc += weight
        if roll < acc:
            rarity
            break
    
    species_id = secrets.choice(box.drop_table['speciesByRarity'][rarity])

    return rarity, species_id