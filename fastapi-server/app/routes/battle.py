import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud.battle import get_team_by_id, get_user_teams, record_battle_result, save_team
from app.crud.pets import list_user_instances
from app.utils.battle_engine import BattlePet, build_battle_pet, make_rng, simulate
from app.crud.pet_species import get_pet_species
from app.utils.battle_enemy import build_enemy_team, reward_for
from app.crud.user_points import get_points_by_user_id, update_user_points
from app.models.battle_log import Battle_Log
from app.models.battle_team import Battle_Team
from sqlalchemy.orm import Session
from app.crud.battle_profile import get_or_create_profile

router = APIRouter(prefix="/battle", tags=["battle"])

def serialize_team(team: Battle_Team) -> dict[str, object]:
    return {
        "id": team.id,
        "name": team.name,
        "trophies": team.trophies,
        "wins": team.wins,
        "losses": team.losses,
        "streak": team.streak,
        "bestStreak": team.best_streak,
        "members": [
            {
                "instanceId": m.pet_instance.instance_id,
                "speciesId": m.pet_instance.species_id,
                "nickname": m.pet_instance.nickname,
                "level": m.pet_instance.level,
                "slot": m.slot,
            }
            for m in team.members
        ],
    }

@router.get("/teams")
def get_profile(request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    teams = get_user_teams(db, session.user_id)

    return {
        "ok": True,
        "teams": [serialize_team(t) for t in teams]
    }

class TeamRequestBody(BaseModel):
    team: list[str]
    name: str

@router.post("/team")
def set_team(body: TeamRequestBody, request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    if len(body.team) > 5 or len(body.team) < 5:
        raise HTTPException(400, "team must have 5 members")
    
    owned_pet_ids = {i.instance_id for i in list_user_instances(db, session.user_id)}

    seen = set()
    cleaned = []
    for instance_id in body.team:
        if instance_id not in owned_pet_ids:
            raise HTTPException(400, "team contains a pet you do not own")
        if instance_id in seen:
            raise HTTPException(400, "team contains duplicate pet id")
        seen.add(instance_id)
        cleaned.append(instance_id)

    try:
        save_team(db, session.user_id, body.name, cleaned)
        db.commit()
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "could not save team")
    
    teams = get_user_teams(db, session.user_id)

    return {
        "ok": True,
        "teams": [serialize_team(t) for t in teams]
    }

@router.post("/fight/{team_id}")
def fight(team_id: int, request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    team = get_team_by_id(db, session.user_id, team_id)

    species_by_id = {s.species_id: s for s in get_pet_species(db)}

    if not team:
        raise HTTPException(404, "team not found")

    tier = team.trophies

    try:
        seed = secrets.token_bytes(32)
        seed_hash = hashlib.sha256(seed).hexdigest()
        rng = make_rng(seed)

        player_line: list[BattlePet] = []
        for member in team.members:
            instance = member.pet_instance
            species = species_by_id.get(instance.species_id)
            if species is None:
                raise HTTPException(409, "team contains an unavailable pet")
            player_line.append(build_battle_pet(instance, species))

        enemy_line = build_enemy_team(tier, rng, list(species_by_id.values()))

        events = simulate(player_line, enemy_line, rng)
        start_ev = events[0]
        player_start = start_ev["player"]
        enemy_start = start_ev["enemy"]
        result = events[-1]["result"]

        pts = get_points_by_user_id(db, session.user_id)

        record_battle_result(team, result)

        profile = get_or_create_profile(db, session.user_id)

        reward = 0

        if tier > profile.highest_trophy:
            profile.highest_trophy = tier
            reward = reward_for(db, session.user_id, result, tier, team.streak)

        points_remaining = pts.points + reward
        update_user_points(db, session.user_id, points_remaining)

        db.add(Battle_Log(
            user_id=session.user_id,
            team_id=team.id,
            result=result,
            reward=reward,
            trophies_after=team.trophies,
            enemy_tier=tier,
            seed_hash=seed_hash
        ))

        db.commit()
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "could not resolve battle")
    
    return {
        "ok": True,
        "result": result,
        "reward": reward,
        "trophiesAfter": team.trophies,
        "hightestTrophies": profile.highest_trophy,
        "streakAfter": team.streak,
        "pointsRemaining": points_remaining,
        "playerTeam": player_start,
        "enemyTeam": enemy_start,
        "events": events
    }

    
    
    

    
