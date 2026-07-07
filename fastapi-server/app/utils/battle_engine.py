import random
from dataclasses import dataclass, field
from typing import NamedTuple, Literal, TypedDict
from app.models.pet_instance import Pet_Instance
from app.models.pet_species import Pet_Species

class PetSnapshot(TypedDict):
    instanceId: str | None
    speciesId: str
    name: str
    rarity: str
    attack: int
    health: int
    maxHealth: int
    level: int
    special: "SpecialResolution | None"

class DamageEffect(TypedDict):
    type: Literal["damage"]
    side: Literal["player", "enemy"]
    index: int
    amount: int


class StatChangeEffect(TypedDict, total=False):
    type: Literal["stat_change"]
    side: Literal["player", "enemy"]
    index: int
    dHealth: int
    dAttack: int


class HealEffect(TypedDict):
    type: Literal["heal"]
    side: Literal["player", "enemy"]
    index: int
    amount: int


Effect = DamageEffect | StatChangeEffect | HealEffect

class StartEvent(TypedDict):
    type: Literal["start"]
    player: list[dict]
    enemy: list[dict]

class AbilityEvent(TypedDict, total=False):
    type: Literal["ability"]
    side: Literal["player", "enemy"]
    sourceIndex: int
    abilityId: str
    abilityName: str
    effects: list[Effect]
    note: str

class AttackEvent(TypedDict):
    type: Literal["attack"]
    playerDamage: int
    enemyDamage: int
    playerHealthAfter: int
    enemyHealthAfter: int

class FaintEvent(TypedDict):
    type: Literal["faint"]
    side: Literal["player", "enemy"]
    index: int

class EndEvent(TypedDict):
    type: Literal["end"]
    result: Literal["win", "loss", "draw"]

BattleEvent = (
    StartEvent
    | AbilityEvent
    | AttackEvent
    | FaintEvent
    | EndEvent
)

class SpecialResolution(NamedTuple):
    id: str
    name: str
    description: str
    magnitude: int

def make_rng(seed: bytes) -> random.Random:
    return random.Random(int.from_bytes(seed[:8], "big"))

@dataclass
class BattlePet:
    instance_id: str | None
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
    def revived_used(self) -> bool:
        return self.flags.get("revived_used", False)
    
    @revived_used.setter
    def revived_used(self, value: bool) -> None:
        self.flags["revived_used"] = value

def snapshot(pet: BattlePet) -> PetSnapshot:

    return {
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
    
def _resolve_special(config: dict[str, object], level: int) -> SpecialResolution | None:
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
    
    return SpecialResolution(
        id=id,
        name=name,
        description=description,
        magnitude=magnitude

    )

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

Side = Literal["player", "enemy"]
MAX_CLASHES = 200

def _trigger_order(
    player: list[BattlePet],
    enemy: list[BattlePet],
) -> list[tuple[BattlePet, Side]]:
    entries: list[tuple[int, int, int, BattlePet, Side]] = []

    for index, pet in enumerate(player):
        entries.append((-pet.attack, 0, index, pet, "player"))

    for index, pet in enumerate(enemy):
        entries.append((-pet.attack, 1, index, pet, "enemy"))

    entries.sort(key=lambda e: (e[0], e[1], e[2]))

    return [(pet, side) for (_a, _s, _i, pet, side) in entries]

def simulate(player_pets: list[BattlePet], enemy_pets: list[BattlePet], rng: random.Random) -> list[BattleEvent]:
    from app.utils.battle_abilities import ABILITY, AbilityCtx

    def ability_entry(pet: BattlePet):
        sp = pet.special
        if sp is None:
            return None
        return ABILITY.get(sp.id)

    events: list[BattleEvent] = []

    events.append({
        "type": "start",
        "player": [snapshot(p) for p in player_pets],
        "enemy": [snapshot(p) for p in enemy_pets]
    })

    def run_ability(pet: BattlePet, side: str) -> None:
        special = pet.special
        if special is None:
            return
        
        entry = ABILITY.get(special.id)

        if entry is None:
            return
        
        line = player_pets if side == "player" else enemy_pets

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
            rng=rng
        )

        effects = entry.apply(ctx)

        event: BattleEvent = {
            "type": "ability",
            "side": side,
            "sourceIndex": source_index,
            "abilityId": special.id,
            "abilityName": special.name,
            "effects": effects
        }

        if ctx.note is not None:
            event["note"] = ctx.note

        events.append(event)

    def resolve_faints() -> None:
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
                    
                    entry = ability_entry(pet)
                    if entry is not None and entry.trigger == "on_faint":
                        run_ability(pet, side)

                    if pet in line and pet.health > 0:
                        idx = line.index(pet) + 1
                        continue

                    if pet in line:
                        live_index = line.index(pet)
                        events.append({
                            "type": "faint",
                            "side": side,
                            "index": live_index
                        })
                        line.remove(pet)
                        progressed = True
    
    for pet, side in _trigger_order(player_pets, enemy_pets):
        entry = ability_entry(pet)
        if entry is not None and entry.trigger == "start_of_battle":
            run_ability(pet, side)

    resolve_faints()

    clashes = 0

    while player_pets and enemy_pets and clashes < 200:
        clashes += 1

        pf = player_pets[0]
        ef = enemy_pets[0]

        for pet, side in _trigger_order([pf], [ef]):
            entry = ability_entry(pet)
            if entry is not None and entry.trigger == "before_attack":
                run_ability(pet, side)

        resolve_faints()

        if not player_pets or not enemy_pets:
            break

        pf = player_pets[0]
        ef = enemy_pets[0]

        player_damage = pf.attack
        enemy_damage = ef.attack

        ef.health -= player_damage
        pf.health -= enemy_damage

        hurt: list[tuple[BattlePet, Side]] = []
        if enemy_damage > 0 and pf.health > 0:
            hurt.append((pf, "player"))
        if player_damage > 0 and ef.health > 0:
            hurt.append((ef, "enemy"))
        for pet, side in sorted(hurt, key=lambda h: (-h[0].attack, 0 if h[1] == "player" else 1)):
            entry = ability_entry(pet)
            if entry is not None and entry.trigger == "on_hurt":
                run_ability(pet, side)

        events.append({
            "type": "attack",
            "playerDamage": player_damage,
            "enemyDamage": enemy_damage,
            "playerHealthAfter": pf.health,
            "enemyHealthAfter": ef.health
        })

        resolve_faints()
    
    if clashes >= MAX_CLASHES and player_pets and enemy_pets:
        result = "draw"

    elif not player_pets and not enemy_pets:
        result = "draw"
    elif not player_pets:
        result = "loss"
    else:
        result = "win"

    events.append({"type": "end", "result": result})
    return events
                    
    

