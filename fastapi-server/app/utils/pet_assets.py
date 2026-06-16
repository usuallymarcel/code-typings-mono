import base64
import hashlib
import hmac
import time
from app.config import env
from app.database import Session
from app.models.pet_species import Pet_Species


ASSEST_TTL = 60 * 60

def sign_sprite_url(user_id: int, species_id: str, behavior: str):
    exp = int(time.time()) + ASSEST_TTL
    payload = f"{user_id}|{species_id}|{behavior}|{exp}"

    sig = hmac.new(env.pet_assets_secret.encode(), payload.encode(), hashlib.sha256).digest()

    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()

    return f"/pet-assets/{species_id}/{behavior}.png?uid={user_id}&exp={exp}&sig={sig_b64}"

def sign_sprite_urls_for_species(db: Session, user_id: int, species_id: str) -> dict[str, str]:
    species = db.query(Pet_Species).filter(Pet_Species.species_id == species_id).first()

    return {
        beh: sign_sprite_url(user_id, species_id, beh) for beh in species.config["animations"].keys()
    }