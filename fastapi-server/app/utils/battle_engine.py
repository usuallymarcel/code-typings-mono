import random
from dataclasses import dataclass, field
from typing import Any, NamedTuple, Optional
from app.models.pet_instance import Pet_Instance
from app.models.pet_species import Pet_Species

class SpecialResolution(NamedTuple):
    id: str
    name: str
    description: str
    magnitude: int

def make_rng(seed: bytes) -> random.Random:
    return random.Random(int.from_bytes(seed[:8], "big"))

@dataclass
class BattlePet:
    instance_id: Optional[str]
    species_id: str
    name: str
    rarity: str
    attack: int
    health: int
    max_health: int
    level: int
    special: SpecialResolution | None
    flags: dict[str, bool] = field(default_factory=dict)

    @property
    def revivied_used(self) -> bool:
        return self.flags.get("revived_used", False)
    
    @revivied_used.setter
    def revived_used(self, value: bool) -> None:
        self.flags["revivied_used"] = value

def snapshot(pet: BattlePet) -> dict[str, Any]:

    snap: dict[str, Any] = {
        "instanceId": pet.instance_id,
        "speciesId": pet.species_id,
        "name": pet.name,
        "rarity": pet.rarity,
        "attack": pet.attack,
        "health": pet.health,
        "maxHealth": pet.max_health,
        "level": pet.level,
        "special": pet.special
    }
    
    return snap

def _resolve_special(config: dict[str, Any], level: int) -> SpecialResolution | None:
    raw = config.get("special")

    if not raw:
        return None
    
    id: str = raw.get("id")
    name: str = raw.get("name")
    description: str = raw.get("description")
    magnitude = raw.get("magnitude")


    if not magnitude or not id or not name or not description:
        raise ValueError("missing keys in species config")
    
    magnitude = int(magnitude) * level
    
    return {
        "id": id,
        "name": name,
        "description": description,
        "magnitude": magnitude
    }

def build_battle_pet(instance: Pet_Instance, species: Pet_Species) -> BattlePet:
    level = instance.level

    config = species.config
    base_attack = config.get("baseAttack")
    base_health = config.get("baseHealth")

    if not base_attack or not base_health:
        raise ValueError("missing attack or health from species config")

    base_attack = int(base_attack)
    base_health = int(base_health)

    attack = base_attack * level
    health = base_health * level

    return BattlePet(
        instance_id=instance.instance_id,
        species_id=species.species_id,
        name=species.display_name,
        rarity=species.rarity,
        attack=attack,
        health=health,
        max_health=health,
        level=level,
        special=_resolve_special(config, level),
        flags={},
    )

def simulate(player_pets: list[BattlePet], enemy_pets: list[BattlePet], rng: random.Random):
    from app.utils.battle_abilities import ABILITY, AbilityCtx

    