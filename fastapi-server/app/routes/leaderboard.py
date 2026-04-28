
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.crud.leaderboard import create_leaderboard_entry, get_entries, get_entry_by_user_id
from app.crud.session_tokens import create_leaderboard_token
from app.database import get_db
from app.utils.session_tokens import check_session_token, get_session_from_request


router = APIRouter(prefix='/leaderboard', tags=['leaderboard'])

class CreateEntryRequest(BaseModel):
    score: int
    category: str
    token: str

@router.post('')
def create_entry(request: Request, data: CreateEntryRequest, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)
    check_session_token(db, data.token)

    entry = get_entry_by_user_id(db, session.user_id, data.category)
    
    if not entry:
        entry = create_leaderboard_entry(db, session.user_id, data.score, data.category)
        return {'ok': True, 'message': 'new entry created', 'entry': entry}


    if entry.score < data.score:
        db.delete(entry)
        db.commit()
        entry = create_leaderboard_entry(db, session.user_id, data.score, data.category)
        return {'ok': True, 'message': 'new entry created', 'entry': entry}
    
    return {'ok': True, 'message': 'no new entry, new score lower than current', 'entry': entry}

@router.get('')
def get_leaderboard(category: str = '10', db: Session = Depends(get_db)):
    return {'ok': True, 'leaderboard': get_entries(db, category)}

@router.get('/token')
def get_leaderboard_token(request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    token = create_leaderboard_token(db, session.user_id)

    return {'ok': True, 'token': token.id}

@router.get('/own')
def get_leaderboard_own(request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    return {'ok': True, 'leaderboard': get_entries(db, user_id=session.user_id)}
