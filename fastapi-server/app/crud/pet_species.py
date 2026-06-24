from app.database import Session
from app.models.pet_species import Pet_Species

def get_pet_species(db: Session):
    return db.query(Pet_Species).filter(Pet_Species.enabled == True).all()