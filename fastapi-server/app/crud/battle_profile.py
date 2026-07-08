from sqlalchemy.orm import Session
from app.models.battle_profile import Battle_Profile

def get_or_create_profile(db: Session, user_id: int) -> Battle_Profile:
    profile = db.query(Battle_Profile).filter(Battle_Profile.user_id == user_id).first()

    if not profile:
        profile = Battle_Profile(
            user_id=user_id,
            highest_trophy=0,
        )
        db.add(profile)
        db.flush()
        db.refresh(profile)
    
    return profile