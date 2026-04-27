import enum

from sqlalchemy.orm import InstrumentedAttribute, Session, joinedload

from app.models.leaderboard import Leaderboard
from app.models.users import User

def create_leaderboard_entry(db: Session, user_id: int, score: int, category: str):
    entry = Leaderboard(
        user_id=user_id,
        score=score,
        category=category
    )

    db.add(entry)
    db.commit()

    return entry

def get_entry_by_user_id(db: Session, user_id: int, category: str = 10):
    return db.query(Leaderboard).filter(Leaderboard.user_id == user_id, Leaderboard.category == category).first()

class Order(enum.Enum):
    DESC='desc'
    ASC='asc'

def get_entries(
    db: Session,
    category: str, 
    take: int = 10, 
    user_id: int | None = None, 
    order: Order = Order.DESC,
    order_by: InstrumentedAttribute = Leaderboard.score
):
    
    query = db.query(Leaderboard).options(joinedload(Leaderboard.user).load_only(
        User.name
    ))

    query = query.filter(Leaderboard.category == category)

    if user_id is not None:
        query = query.filter(Leaderboard.user_id == user_id)
        

    query = query.order_by(
        order_by.asc() if order == Order.ASC else order_by.desc()
    )

    return query.limit(take).all()
