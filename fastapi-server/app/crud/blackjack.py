from sqlalchemy.orm import Session

from app.models.blackjack import Blackjack


def create_game(db: Session, game: Blackjack):
    db.add(game)
    db.commit()
    db.refresh(game)
    return game

def get_game_by_user_id(db: Session, user_id: int):
    return db.query(Blackjack).filter(Blackjack.user_id == user_id).first()

def delete_game_by_user_id(db: Session, user_id: int):
    game = db.query(Blackjack).filter(Blackjack.user_id == user_id).first()
    
    if game:
        db.delete(game)
        db.commit()
    
def save_game(db: Session):
    db.commit()