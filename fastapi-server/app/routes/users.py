
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.crud.session_tokens import create_session
from app.database import get_db
from app.crud.users import create_user, get_user_by_name
from app.utils.credentials import check_password
from app.utils.session_tokens import get_session_from_request


router = APIRouter(prefix='/users', tags=['users'])

class login_data(BaseModel):
    name: str
    password: str

class signup_data(login_data):
    email: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True

@router.post('/login')
def login(data: login_data, response: Response, db: Session = Depends(get_db)):
    user = get_user_by_name(db, data.name)

    if not user:
        return {'verified': False, 'message': 'Incorrect login details'}
    
    if not check_password(data.password, user.hashed_password, user.salt, user.iterations):
        return {'verified': False, 'message': 'Incorrect login details'}
    
    session_token = create_session(db, user.id)

    response.set_cookie(
        key='session_id',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='lax'
    )

    return {'verified': True, 'message': 'Successfully logged in', 'user': UserResponse.model_validate(user)}

@router.post('/sign_up')
def sign_up(data: signup_data, response: Response, db: Session = Depends(get_db)):
    user = get_user_by_name(db, data.name)

    if user:
        return {'verified': False, 'message': 'user exists already for that name'}

    user = create_user(db, data.name, data.email, data.password)

    session_token = create_session(db, user.id)

    response.set_cookie(
        key='session_id',
        value=session_token,
        httponly=True,
        secure=True,
        samesite='lax'
    )

    return {'verified': True, 'message': 'created new user', 'user': UserResponse.model_validate(user)}

@router.get('/check_session')
def check_session(request: Request, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)

    return {'verified': True, 'message': 'Session valid', 'expires': session.expires_at}

@router.post('/logout')
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    session = get_session_from_request(db, request)
    db.delete(session)
    db.commit()

    response.delete_cookie('session_id')

    return {'ok': True, 'message': 'logged out successfully'}

