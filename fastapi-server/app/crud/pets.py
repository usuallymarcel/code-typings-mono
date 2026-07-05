from sqlalchemy.orm import Session
from app.models.pet_instance import Pet_Instance

def list_user_instances(db: Session, user_id: int) -> list[Pet_Instance]:
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id).order_by(Pet_Instance.species_id.desc()).all()

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

def set_nickname(db: Session, uid: int, instance_id: str, nickname: str):
    instance = db.query(Pet_Instance).filter(Pet_Instance.user_id == uid, Pet_Instance.instance_id == instance_id).first()

    instance.nickname = nickname
    db.commit()
    db.refresh(instance)
    return instance

def get_pet_instance(db: Session, uid: int, instance_id: str):
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == uid, Pet_Instance.instance_id == instance_id).first()

def merge_instances(db: Session, user_id: int, target_id: str, sacrifice_id: str) -> Pet_Instance | None:
    target = get_pet_instance(db, user_id, target_id)
    sacrifice = get_pet_instance(db, user_id, sacrifice_id)

    if target is None or sacrifice is None:
        return None
    
    target.level = target.level + 1

    db.delete(sacrifice)
    db.add(target)
    db.flush()
    db.refresh(target)

    return target
