
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.crud.leaderboard import create_leaderboard_entry, get_entries, get_entry_by_user_id
from app.database import get_db
from app.utils.session_tokens import get_session_from_request


router = APIRouter(prefix='/leaderboard', tags=['leaderboard'])

class CreateEntryRequest(BaseModel):
    score: int

@router.post('')
def create_entry(request: Request, data: CreateEntryRequest, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    entry = get_entry_by_user_id(db, session.user_id)

    
    if not entry:
        entry = create_leaderboard_entry(db, session.user_id, data.score)
        return {'ok': True, 'message': 'new entry created', 'entry': entry}


    if entry.score < data.score:
        db.delete(entry)
        db.commit()
        entry = create_leaderboard_entry(db, session.user_id, data.score)
        return {'ok': True, 'message': 'new entry created', 'entry': entry}
    
    return {'ok': True, 'message': 'no new entry, new score lower than current', 'entry': entry}

@router.get('')
def get_leaderboard(db: Session = Depends(get_db)):

    return {'ok': True, 'leaderboard': get_entries(db)}

@router.get('/own')
def get_leaderboard_own(request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    return {'ok': True, 'leaderboard': get_entries(db, user_id=session.user_id)}
