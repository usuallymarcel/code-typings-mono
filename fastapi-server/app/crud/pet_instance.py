from app.database import Session
from app.models.pet_instance import Pet_Instance

def get_pet_instance_by_user_id(db: Session, user_id: int, species_id: str):
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id, Pet_Instance.species_id == species_id).first()

def get_pet_instance_by_id(db: Session, user_id: int, instance_id: str):
    return db.query(Pet_Instance).filter(Pet_Instance.instance_id == instance_id, Pet_Instance.user_id == user_id).first()

def get_pet_instances(db: Session, user_id: int, instances: list[str]):
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == user_id, Pet_Instance.instance_id.in_(instances)).all()