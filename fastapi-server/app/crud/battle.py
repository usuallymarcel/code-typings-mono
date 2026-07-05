from sqlalchemy.orm import Session

from app.models.battle_profile import Battle_Profile
from app.models.battle_log import Battle_Log

def get_or_create_profile(db: Session, user_id: int) -> Battle_Profile:
    profile = db.query(Battle_Profile).filter(Battle_Profile.user_id == user_id).first()

    if not profile:
        profile = Battle_Profile(
            user_id=user_id,
            trophies=0,
            wins=0,
            losses=0,
            streak=0,
            best_streak=0,
            team=[]
        )
        db.add(profile)
        db.flush()
        db.refresh(profile)

    return profile

def save_team(db: Session, user_id: int, instance_ids: list[str]) -> Battle_Profile:
    profile = get_or_create_profile(db, user_id)
    profile.team = list(instance_ids)
    db.add(profile)
    db.flush()
    db.refresh(profile)

    return profile

def record_battle_result(db: Session, profile: Battle_Profile, result: str) -> Battle_Profile:
    if result == "win":
        profile.trophies = profile.trophies + 1
        profile.streak = profile.streak + 1
        profile.best_streak = max(profile.best_streak, profile.streak)
        profile.wins = profile.wins + 1
    elif result == "loss":
        profile.trophies = max(0, profile.trophies - 1)
        profile.streak = 0
        profile.losses = profile.losses + 1

    #draw doesn't do anything
    return profile

def write_battle_log(db: Session, user_id: int, result: str, reward: int, trophies_after: int, enemy_tier: int, seed_hash: str) -> Battle_Log:
    log = Battle_Log(
        user_id=user_id,
        result=result,
        reward=reward,
        trophies_after=trophies_after,
        enemy_tier=enemy_tier,
        seed_hash=seed_hash
    )

    db.add(log)
    db.flush()
    db.refresh(log)

    return log
