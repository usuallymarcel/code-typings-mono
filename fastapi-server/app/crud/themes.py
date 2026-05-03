from sqlalchemy.orm import Session

from app.models.themes import Theme
from app.models.user_themes import User_Theme


def get_themes_by_name(db: Session, name: str):

    theme = db.query(Theme).filter(Theme.name == name).first()

    return theme


# def update_user_points(db: Session, user_id: str, points: int):
#     db.query(User_Point).filter(User_Point.user_id == user_id).update({User_Point.points: points})

#     db.commit()

def create_theme(db: Session, theme: str, price: int):
    
    theme = Theme(
                    theme=theme,
                    price=price
                )
    db.add(theme)
    db.commit()
    db.refresh(theme)

    return theme