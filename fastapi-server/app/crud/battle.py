from sqlalchemy.orm import Session, selectinload

from app.models.battle_log import Battle_Log
from app.models.battle_team import Battle_Team
from app.models.battle_team_member import Battle_Team_Member

def get_or_create_team(db: Session, user_id: int, name: str) -> Battle_Team:
    team = db.query(Battle_Team).filter(Battle_Team.user_id == user_id, Battle_Team.name == name).first()

    if not team:
        team = Battle_Team(
            user_id=user_id,
            name=name,
            trophies=0,
            wins=0,
            losses=0,
            streak=0,
            best_streak=0,
        )
        db.add(team)
        db.flush()
        db.refresh(team)

    return team

def get_team_by_id(db: Session, user_id: int, team_id: int):
    return db.query(Battle_Team).filter(Battle_Team.user_id == user_id, Battle_Team.id == team_id).options(selectinload(Battle_Team.members).selectinload(Battle_Team_Member.pet_instance)).first()

def delete_team_by_id(db: Session, user_id: int, team_id: int):
    db.query(Battle_Team).filter(Battle_Team.user_id == user_id, Battle_Team.id == team_id).delete()
    db.commit()

def get_team_members(db: Session, team_id: int) -> list[Battle_Team_Member]:
    return db.query(Battle_Team_Member).filter(Battle_Team_Member.team_id == team_id).all()

def get_user_teams(db: Session, user_id: int):
    return (db.query(Battle_Team).filter(Battle_Team.user_id == user_id).options(selectinload(Battle_Team.members).selectinload(Battle_Team_Member.pet_instance)).all())

def save_team(db: Session, user_id: int, name: str, instance_ids: list[str]) -> Battle_Team:
    team = get_or_create_team(db, user_id, name)

    db.query(Battle_Team_Member).filter(Battle_Team_Member.team_id == team.id).delete()

    for slot, instance_id in enumerate(instance_ids):
        db.add(Battle_Team_Member(
            team_id=team.id,
            pet_instance_id=instance_id,
            slot=slot
        ))

    db.flush()
    db.refresh(team)

    return team

def record_battle_result(team: Battle_Team, result: str) -> Battle_Team:
    if result == "win":
        team.trophies = team.trophies + 1
        team.streak = team.streak + 1
        team.best_streak = max(team.best_streak, team.streak)
        team.wins = team.wins + 1
    elif result == "loss":
        team.trophies = max(0, team.trophies - 1)
        team.streak = 0
        team.losses = team.losses + 1

    #draw doesn't do anything
    return team

def write_battle_log(db: Session, user_id: int, team_id: int, result: str, reward: int, trophies_after: int, enemy_tier: int, seed_hash: str) -> Battle_Log:
    log = Battle_Log(
        user_id=user_id,
        team_id=team_id,
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
