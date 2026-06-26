import hashlib
import secrets

from pydantic import BaseModel

from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import list_user_instances
from app.crud.pet_species import get_pet_species
from app.crud.user_points import get_points_by_user_id, update_user_points
from app.crud.battle import get_or_create_profile, save_team, record_battle_result
from app.utils.battle_engine import (
    make_rng,
    build_battle_pet,
    simulate,
    level_for_xp,
    species_special,
    RARITY_BASE,
)
from app.utils.battle_enemy import build_enemy_team, reward_for
from app.models.battle_log import Battle_Log


router = APIRouter(prefix="/battle", tags=["battle"])


def species_lookup(db) -> dict:
    """species_id -> Pet_Species for every enabled species, built once per request."""
    return {s.species_id: s for s in get_pet_species(db)}


def to_team_pet(instance, species) -> dict:
    """Resolve one owned Pet_Instance + its Pet_Species into the leaner TeamPet
    shape used by /battle/profile and /battle/team.

    This intentionally omits maxHealth and isToken (those belong to the fuller
    PetSnapshot the engine emits in the battle start frame). Stats are derived
    from xp via the authoritative formulas: attack = baseAttack + xp,
    health = baseHealth + xp, with the RARITY_BASE defaults as fallback.
    """
    xp = instance.xp
    level = level_for_xp(xp)
    base_attack, base_health = RARITY_BASE.get(species.rarity, (2, 3))
    config = species.config or {}
    attack = int(config.get("baseAttack", base_attack)) + xp
    health = int(config.get("baseHealth", base_health)) + xp
    return {
        "instanceId": instance.instance_id,
        "speciesId": species.species_id,
        "displayName": species.display_name,
        "rarity": species.rarity,
        "attack": attack,
        "health": health,
        "level": level,
        "special": species_special(species, level),
    }


def resolve_team(db, user_id: int, species_by_id: dict) -> tuple[list, list[dict]]:
    """Load the saved team, drop ids the user no longer owns or whose species is
    disabled/missing, and return (ordered_instances, ordered_team_pets).

    The pruned ordering is what gets persisted back so stale ids self-heal.
    """
    profile = get_or_create_profile(db, user_id)

    instances_by_id = {i.instance_id: i for i in list_user_instances(db, user_id)}

    ordered_instances = []
    team_pets = []
    pruned_team = []

    for instance_id in profile.team:
        instance = instances_by_id.get(instance_id)
        if instance is None:
            continue
        species = species_by_id.get(instance.species_id)
        if species is None:
            continue
        ordered_instances.append(instance)
        team_pets.append(to_team_pet(instance, species))
        pruned_team.append(instance_id)

    if pruned_team != profile.team:
        save_team(db, user_id, pruned_team)
        db.commit()

    return ordered_instances, team_pets


def profile_payload(profile) -> dict:
    return {
        "trophies": profile.trophies,
        "wins": profile.wins,
        "losses": profile.losses,
        "streak": profile.streak,
        "bestStreak": profile.best_streak,
    }


@router.get("/profile")
def get_profile(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    species_by_id = species_lookup(db)
    profile = get_or_create_profile(db, session.user_id)

    _, team = resolve_team(db, session.user_id, species_by_id)

    return {
        "ok": True,
        "profile": profile_payload(profile),
        "team": team,
    }


class TeamBody(BaseModel):
    team: list[str]


@router.post("/team")
def set_team(body: TeamBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    if len(body.team) > 5:
        raise HTTPException(400, "team may contain at most 5 pets")

    owned_ids = {i.instance_id for i in list_user_instances(db, session.user_id)}

    seen = set()
    cleaned = []
    for instance_id in body.team:
        if instance_id not in owned_ids:
            raise HTTPException(400, "team contains a pet you do not own")
        if instance_id in seen:
            raise HTTPException(400, "team contains a duplicate pet")
        seen.add(instance_id)
        cleaned.append(instance_id)

    try:
        save_team(db, session.user_id, cleaned)
        db.commit()
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not save team")

    species_by_id = species_lookup(db)
    profile = get_or_create_profile(db, session.user_id)
    _, team = resolve_team(db, session.user_id, species_by_id)

    return {
        "ok": True,
        "profile": profile_payload(profile),
        "team": team,
    }


@router.post("/fight")
def fight(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    species_by_id = species_lookup(db)

    profile = get_or_create_profile(db, session.user_id)
    team_instances, _ = resolve_team(db, session.user_id, species_by_id)

    if not team_instances:
        # resolve_team / get_or_create_profile may have flushed a freshly-created
        # empty profile; roll it back so the 400 path leaves nothing dangling
        # (the profile is re-created on the next real call anyway).
        db.rollback()
        raise HTTPException(400, "you have no pets in your battle team")

    tier = profile.trophies

    try:
        # Seed inline, mirroring lootbox_roll.py: 32 CSPRNG bytes + sha256 hex.
        seed = secrets.token_bytes(32)
        seed_hash = hashlib.sha256(seed).hexdigest()
        rng = make_rng(seed)

        player_line = [
            build_battle_pet(inst, species_by_id[inst.species_id])
            for inst in team_instances
        ]
        enemy_line = build_enemy_team(tier, rng, list(species_by_id.values()))

        # simulate() returns the bare events list and MUTATES the lines in place.
        # The start frame (events[0]) holds the start-of-battle snapshots; the end
        # frame (events[-1]) holds the result.
        events = simulate(player_line, enemy_line, rng)
        start_ev = events[0]
        player_start = start_ev["player"]
        enemy_start = start_ev["enemy"]
        result = events[-1]["result"]

        # Apply the ladder deltas FIRST so streak/trophies reflect this battle,
        # then read them back for the reward (streak AFTER incrementing).
        record_battle_result(db, profile, result)
        reward = reward_for(result, tier, profile.streak)

        pts = get_points_by_user_id(db, session.user_id)
        points_remaining = pts.points + reward
        update_user_points(db, session.user_id, points_remaining)

        db.add(Battle_Log(
            user_id=session.user_id,
            result=result,
            reward=reward,
            trophies_after=profile.trophies,
            enemy_tier=tier,
            seed_hash=seed_hash,
        ))

        db.commit()
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not resolve battle")

    return {
        "ok": True,
        "result": result,
        "reward": reward,
        "trophiesAfter": profile.trophies,
        "streakAfter": profile.streak,
        "pointsRemaining": points_remaining,
        "playerTeam": player_start,
        "enemyTeam": enemy_start,
        "events": events,
    }
