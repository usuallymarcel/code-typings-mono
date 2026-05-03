from sqlalchemy.orm import Session

from app.models.user_themes import User_Theme


def get_themes_by_user_id(db: Session, user_id: str):

    themes = db.query(User_Theme).filter(User_Theme.user_id == user_id).all()

    if not themes:
        themes = [create_theme_by_user_id(db, user_id)]

    return themes

def get_user_theme(db: Session, user_id: str, theme: str):
    return db.query(User_Theme).filter(User_Theme.user_id == user_id, User_Theme.theme == theme).first()


# def update_user_points(db: Session, user_id: str, points: int):
#     db.query(User_Point).filter(User_Point.user_id == user_id).update({User_Point.points: points})

#     db.commit()

def create_theme_by_user_id(db: Session, user_id: str, theme: str = 'dark'):
    
    user_theme = User_Theme(
                            user_id=user_id,
                            theme=theme
                            )
    db.add(user_theme)
    db.commit()
    db.refresh(user_theme)

    return user_theme