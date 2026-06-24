

import random

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.crud.user_points import create_points, get_points_by_user_id, update_user_points
from app.database import get_db
from app.utils.session_tokens import check_session_token, get_session_from_request


router = APIRouter(prefix='/points', tags=['points'])

class UpdatePointsRequest(BaseModel):
    score: int
    category: str
    token: str

# class CoinFlipResquest(BaseModel):
#     heads: bool

@router.get('')
def get_points(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    points = get_points_by_user_id(db, session.user_id)

    return {'ok': True, 'points': points}

@router.post('')
def update_points(request: Request, data: UpdatePointsRequest, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    check_session_token(db, data.token)

    if data.score > 165:
        return {'ok': True, 'message': 'no entry created'}

    points = get_points_by_user_id(db, session.user_id)

    multiplier = 10
    if (data.category.isdigit()):
        multiplier = int(data.category)

    newPoints: int = points.points + data.score * multiplier
    update_user_points(db, session.user_id, newPoints)
    db.commit()

    return {'ok': True, 'points': newPoints}

# @router.post('/flip_coin')
# def flip_coin(request: Request, data: CoinFlipResquest, db = Depends(get_db)):
#     session = get_session_from_request(db, request)

#     points = get_points_by_user_id(db, session.user_id)

#     rand = random.randint(0, 1)

#     if (rand == 1 and not data.heads or rand == 0 and data.heads):      
#         newPoints = round(points.points/2)
#         update_user_points(db, session.user_id, newPoints)
#         return {'ok': True, 'win': False, 'points': newPoints}
#     else: 
#         newPoints = round(points.points*2)
#         update_user_points(db, session.user_id, newPoints)
#         return {'ok': True, 'win': True, 'points': newPoints}


    



