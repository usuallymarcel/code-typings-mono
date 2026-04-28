
from datetime import datetime, timedelta, timezone
import secrets

from sqlalchemy.orm import Session

from app.models.session_tokens import Session_Token


def create_session(db: Session, user_id: int):
    session_id = secrets.token_urlsafe(32)

    session_token = Session_Token(
        id=session_id,
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24)
    )

    db.add(session_token)
    db.commit()

    return session_token

def create_leaderboard_token(db: Session, user_id: int):
    session_id = secrets.token_urlsafe(32)

    session_token = Session_Token(
        id=session_id,
        user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=1)
    )

    db.add(session_token)
    db.commit()

    return session_token

def get_session_token_by_id(db: Session, id: str):
    return db.query(Session_Token).filter(Session_Token.id == id).first()