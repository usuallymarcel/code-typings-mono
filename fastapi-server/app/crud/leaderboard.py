import enum

from sqlalchemy.orm import InstrumentedAttribute, Session, joinedload

from app.models.leaderboard import Leaderboard
from app.models.users import User

def create_leaderboard_entry(db: Session, user_id: int, score: int):
    entry = Leaderboard(
        user_id=user_id,
        score=score
    )

    db.add(entry)
    db.commit()

    return entry

def get_entry_by_user_id(db: Session, user_id: int):
    return db.query(Leaderboard).filter(Leaderboard.user_id == user_id).first()

class Order(enum.Enum):
    DESC='desc'
    ASC='asc'

def get_entries(
    db: Session, 
    take: int = 10, 
    user_id: int | None = None, 
    order: Order = Order.DESC,
    order_by: InstrumentedAttribute = Leaderboard.score
):
    
    query = db.query(Leaderboard).options(joinedload(Leaderboard.user).load_only(
        User.name
    ))

    if user_id is not None:
        query = query.filter(Leaderboard.user_id == user_id)

    query = query.order_by(
        order_by.asc() if order == Order.ASC else order_by.desc()
    )

    return query.limit(take).all()
