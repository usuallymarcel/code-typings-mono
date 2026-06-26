from sqlalchemy.orm import Session
from app.models.pet_instance import Pet_Instance

def list_user_instances(db: Session, user_id: int) -> list[Pet_Instance]:
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id).all()

def create_instance(db: Session, user_id: int, species_id: str, source: str) -> Pet_Instance:
    instance = Pet_Instance(user_id=user_id,
                            species_id=species_id,
                            source=source)
    db.add(instance)
    db.flush()
    db.refresh(instance)

    return instance

def set_active(db: Session, user_id: int, instance_id: str, active: bool):
    instance = db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id,
                                             Pet_Instance.instance_id == instance_id).first()
    
    instance.active = active
    db.commit()
    db.refresh(instance)
    return instance

def get_instance_for_user(db: Session, user_id: int, instance_id: str) -> Pet_Instance | None:
    """
    Fetch a single Pet_Instance by its public instance_id (uuid string), scoped
    to the owning user. Returns None if it does not exist or belongs to someone
    else, so callers can never act on another user's pet.
    """
    return db.query(Pet_Instance).filter(
        Pet_Instance.user_id == user_id,
        Pet_Instance.instance_id == instance_id
    ).first()

def _level_for_xp(xp: int) -> int:
    """Authoritative level curve: 1 if xp<2, 2 if xp<5, 3 if xp>=5 (xp in [0,5])."""
    if xp < 2:
        return 1
    if xp < 5:
        return 2
    return 3

def merge_instances(db: Session, user_id: int, target_id: str, sacrifice_id: str) -> Pet_Instance | None:
    """
    Feed `sacrifice_id` INTO `target_id` (SAP-style merge / level-up).

    THIN, FLUSH-ONLY mutator. The ROUTE (Section 4) owns all business validation
    (both owned, distinct, same species, target xp < 5) and maps violations to
    HTTP 400 BEFORE calling here, mirroring create_instance/update_user_points.

    This function only performs the mutation: re-fetch both instances via
    user-scoped queries as a defensive guard, return None early if either is
    missing, then target.xp += 1 (capped at 5), recompute target.level, and
    DELETE the sacrifice. FLUSHES only; the CALLER commits. Returns the updated
    target (or None if a row vanished between the route's check and here).
    """
    target = get_instance_for_user(db, user_id, target_id)
    sacrifice = get_instance_for_user(db, user_id, sacrifice_id)

    if target is None or sacrifice is None:
        return None

    target.xp = min(5, target.xp + 1)
    target.level = _level_for_xp(target.xp)

    db.delete(sacrifice)
    db.add(target)
    db.flush()
    db.refresh(target)

    return target 