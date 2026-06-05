from sqlalchemy.orm import Session
from app.models.lootbox import Lootbox

def get_lootbox(db: Session, sku: str) -> Lootbox | None:
    return db.query(Lootbox).filter(Lootbox.sku == sku, Lootbox.enabled == True).first()