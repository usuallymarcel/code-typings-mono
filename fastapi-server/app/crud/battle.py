from sqlalchemy.orm import Session

from app.models.battle_profile import Battle_Profile
from app.models.battle_log import Battle_Log


def get_or_create_profile(db: Session, user_id: int) -> Battle_Profile:
    """
    Return the user's Battle_Profile, creating an empty one if it does not exist.

    Mirrors crud.user_points.get_points_by_user_id (auto-create on read), but
    FLUSHES instead of committing so the (possibly newly created) row is part of
    the caller's transaction. The caller owns the commit. Read-only routes that
    only need the profile may commit after calling this.
    """
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
    """
    Overwrite the user's saved team with the given ordered list of instance_id
    strings (front = index 0, max 5). Ownership/length validation is done in the
    route before calling this. Flushes only; the CALLER commits.
    """
    profile = get_or_create_profile(db, user_id)
    profile.team = list(instance_ids)
    db.add(profile)
    db.flush()
    db.refresh(profile)

    return profile


def record_battle_result(db: Session, profile: Battle_Profile, result: str) -> Battle_Profile:
    """
    Apply the ladder progression rules to an already-attached Battle_Profile.

    Pure in-memory mutation per the SPEC ladder:
      win  -> trophies += 1; streak += 1; best_streak = max(best_streak, streak); wins += 1
      loss -> trophies = max(0, trophies - 1); streak = 0; losses += 1
      draw -> unchanged (counts as neither win nor loss)

    Does NOT flush or commit; the route flushes/commits the whole fight as one
    transaction. The `db` arg is accepted for signature symmetry / future use.
    """
    if result == "win":
        profile.trophies = profile.trophies + 1
        profile.streak = profile.streak + 1
        profile.best_streak = max(profile.best_streak, profile.streak)
        profile.wins = profile.wins + 1
    elif result == "loss":
        profile.trophies = max(0, profile.trophies - 1)
        profile.streak = 0
        profile.losses = profile.losses + 1
    # draw: trophies/streak/wins/losses all unchanged

    return profile


def write_battle_log(
    db: Session,
    user_id: int,
    result: str,
    reward: int,
    trophies_after: int,
    enemy_tier: int,
    seed_hash: str
) -> Battle_Log:
    """
    Append an audit row for a resolved fight. Flushes only; the CALLER commits
    (the row is part of the same fight transaction as the profile + points update).

    `enemy_tier` maps to the NOT-NULL enemy_tier column; the route must always
    pass it (it is the pre-fight tier == profile.trophies before the deltas).
    """
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
