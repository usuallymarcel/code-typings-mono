from datetime import datetime

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.crud.messages import get_messages
from app.database import get_db


router = APIRouter(prefix='/messages', tags=['messages'])

class messageRequest(BaseModel):
    before: datetime | None = None
    take: int = 10

@router.get('')
def get_messages_req(query: messageRequest = Depends(), db = Depends(get_db)):

    messages = get_messages(db, query.before, query.take)

    return {'ok': True, 'messages': messages}