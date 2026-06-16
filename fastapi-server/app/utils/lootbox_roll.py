import hashlib
import secrets

from app.models.lootbox import Lootbox
from app.database import Session

RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"]

def roll(db: Session, user_id: int, box: Lootbox) -> tuple[str, str, str]:
    seed = secrets.token_bytes(32)
    seed_hash = hashlib.sha256(seed).digest()

    rarities = box.drop_table["rarities"]

    total = sum(rarities.values())

    r = (int.from_bytes(seed[:8], "big") /2**64) * total

    rarity = "common"
    acc = 0.0

    for name, weight in rarities.items():
        acc += weight
        if r <= acc:
            rarity = name
            break
    
    pool: list[str] = box.drop_table["speciesByRarity"][rarity]

    pick = int.from_bytes(seed[8:16], "big") % len(pool)
    species_id = pool[pick]

    return rarity, species_id, seed_hash