from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, WebSocket
from sqlalchemy.orm import Session

from app.crud.session_tokens import get_session_token_by_id
from app.models.session_tokens import Session_Tokens


def get_session_from_request(db: Session, request: Request):
    session_id = request.cookies.get('session_id')

    if not session_id:
        raise HTTPException(status_code=401, detail='Not authenticated')
    
    session = get_session_token_by_id(db, session_id)

    if not session:
        raise HTTPException(status_code=401, detail='Invalid Session')
    
    if session.expires_at < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=401, detail='Session expired')
    
    refresh_session_if_needed(db, session)

    return session

def refresh_session_if_needed(db: Session, session: Session_Tokens):
    if session.expires_at - datetime.now(timezone.utc) < timedelta(hours=4):
        session.expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        db.commit()

def get_session_from_websocket(db: Session, websocket: WebSocket):
    session_id = websocket.cookies.get('session_id')

    if not session_id:
        return None
    
    session = get_session_token_by_id(db, session_id)

    if not session:
        return None
    
    if session.expires_at < datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        return None
    
    refresh_session_if_needed(db, session)

    return session
