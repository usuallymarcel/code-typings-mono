from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud.battle import get_user_teams, save_team
from app.crud.pets import list_user_instances

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

    if len(body.team) > 5:
        raise HTTPException(400, "team can only have max 5 pets")
    
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
    
    
    

    
