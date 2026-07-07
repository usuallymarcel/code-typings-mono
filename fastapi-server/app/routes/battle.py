import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud.battle import get_team_by_id, get_user_teams, save_team
from app.crud.pets import list_user_instances
from app.utils.battle_engine import build_battle_pet, make_rng
from app.crud.pet_species import get_pet_species
from app.utils.battle_enemy import build_enemy_team

router = APIRouter(prefix="/battle", tags=["battle"])

@router.get("/teams")
def get_profile(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    teams = get_user_teams(db, session.user_id)

    return {
        "ok": True,
        "teams": teams
    }

class TeamRequestBody(BaseModel):
    team: list[str]
    name: str

@router.post("/team")
def set_team(body: TeamRequestBody, request: Request, db = Depends(get_db)):
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
        "teams": teams
    }

@router.post("/fight/{team_id}")
def fight(team_id: str, request: Request, db = Depends(get_db)):
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

        player_line = [build_battle_pet(member.pet_instance, species_by_id[member.pet_instance.species_id]) for member in team.members]

        enemy_line = build_enemy_team(tier, rng, list(species_by_id.values()))
    
    
    

    
