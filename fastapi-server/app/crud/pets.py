from sqlalchemy.orm import Session
from app.models.pet_instance import Pet_Instance

def list_user_instances(db: Session, user_id: int) -> list[Pet_Instance]:
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id).all()

def create_instance(db: Session, user_id: int, species_id: str, source: str) -> Pet_Instance:
    instance = Pet_Instance(user_id=user_id,
                            species_id=species_id,
                            source=source)
    db.add(instance)
    db.commit()
    db.refresh(instance)

    return instance

def set_active(db: Session, user_id: int, instance_id: str, active: bool):
    instance = db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id,
                                             Pet_Instance.instance_id == instance_id).first()
    
    instance.active = active
    db.commit()
    db.refresh(instance)
    return instance 