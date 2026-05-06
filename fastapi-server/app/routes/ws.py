

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.session_tokens import get_session_from_websocket
from app.ws.manager import ConnectionManager
from app.ws.messages import handle_message


router = APIRouter(prefix="/ws", tags=["ws"])

manager = ConnectionManager()

@router.websocket("/chat")
async def websocket(websocket: WebSocket, db: Session = Depends(get_db)):
    session = get_session_from_websocket(db, websocket)

    if not session:
        await websocket.close(code=1008)
        return
    
    await manager.connect(session.user_id, websocket)
    await manager.broadcast({'message': 'connected'})

    try: 
        while True:
            data = await websocket.receive_json()
            await handle_ws_event(db, session.user_id, data)
    except WebSocketDisconnect:
        manager.disconnect(session.user_id)

async def handle_ws_event(db: Session, user_id: int, data: dict):
    event_type = data.get("type")

    match event_type:
        case "message":
            await handle_message(manager, db, user_id, data)