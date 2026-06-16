from app.database import Session
from app.models.pet_instance import Pet_Instance

def get_pet_instance_by_user_id(db: Session, uid: int, species_id: str):
    return db.query(Pet_Instance).filter(Pet_Instance.user_id == uid, Pet_Instance.species_id == species_id).first()