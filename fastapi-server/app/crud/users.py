from sqlalchemy.orm import Session
from app.models.users import Users
from app.utils.credentials import hash_password

def get_user_by_name(db: Session, name: str):
    return db.query(Users).filter(Users.name == name).first()

def create_user(db: Session, name: str, email: str, password: str):
    hashed_password, salt, iterations = hash_password(password)

    user = Users(email=email, 
                name=name, 
                hashed_password=hashed_password,
                salt=salt, 
                iterations=iterations)

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

def get_user_by_id(db: Session, id: int):
    return db.query(Users).filter(Users.id == id).first()