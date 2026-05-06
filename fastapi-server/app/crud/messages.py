from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from app.models.messages import Message
from datetime import datetime

def get_messages(
    db: Session, 
    before: datetime | None = None,
    take: int = 10,
):
    query = db.query(Message)

    if before:
        query = query.filter(Message.created_at < before)

    messages = (
        query
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(take)
        .all()
    )

    return list(reversed(messages))

def create_message(db: Session, sender_name: str, content: str):
    message = Message(
                sender_name=sender_name,
                content=content
    )
    db.add(message)
    db.commit()
    return message
