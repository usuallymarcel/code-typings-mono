from sqlalchemy.orm import Session

from app.models.user_points import User_Point


def get_points_by_user_id(db: Session, user_id: str):

    points = db.query(User_Point).filter(User_Point.user_id == user_id).first()

    if not points:
        points = create_points(db, user_id)

    return points


def update_user_points(db: Session, user_id: str, points: int):
    db.query(User_Point).filter(User_Point.user_id == user_id).update({User_Point.points: points})

    db.flush()

def create_points(db: Session, user_id: str, points: int = 0):
    
    user_points = User_Point(
                            user_id=user_id,
                            points=points
                            )
    db.add(user_points)
    db.commit()
    db.refresh(user_points)

    return user_points