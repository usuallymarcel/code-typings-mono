from datetime import datetime

from sqlalchemy.orm import Session

from app.crud.messages import create_message
from app.crud.users import get_user_by_id
from app.utils.format_time import format_to_nz_time
from app.ws.manager import ConnectionManager


async def handle_message(manager: ConnectionManager, db: Session, user_id: int, data: dict):
    content = data["content"]

    if not content:
        return
    
    user = get_user_by_id(db, user_id)

    create_message(db, user.name, content)

    await manager.broadcast({
        "type": "message",
        "content": content,
        "time": f"{format_to_nz_time(datetime.now())}",
        "sender_name": user.name
    })