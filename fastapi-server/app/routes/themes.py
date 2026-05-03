from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.crud.user_points import get_points_by_user_id, update_user_points
from app.crud.user_themes import create_theme_by_user_id, get_themes_by_user_id, get_user_theme
from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.utils.themes import THEMES


router = APIRouter(prefix='/themes', tags=['themes'])

@router.get('')
def get_themes(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    themes = get_themes_by_user_id(db, session.user_id)

    return {'ok': True, 'themes': themes}

@router.get('/all')
def get_all_themes():
    return {'ok': True, 'themes': THEMES}

@router.post('/buy/{theme}')
def buy_theme(request: Request, theme: str, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    if theme not in THEMES:
        raise HTTPException(status_code=404, detail="Themes does not exist")
    
    price = THEMES[theme]["price"]

    user_points = get_points_by_user_id(db, session.user_id)

    if user_points.points < price:
        raise HTTPException(status_code=400, detail="Broke boy status, ain't no secret")
    
    existing = get_user_theme(db, session.user_id, theme)

    if existing:
        raise HTTPException(status_code=400, detail="theme already owned")
    

    newPoints: int = user_points.points - price
    update_user_points(db, session.user_id, newPoints)

    create_theme_by_user_id(db, session.user_id, theme)

    return {"ok": True, "theme": theme, "points": newPoints}