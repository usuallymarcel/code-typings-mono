from pydantic import BaseModel

from app.database import get_db
from fastapi import APIRouter, Depends, Request
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import list_user_instances, set_active
from app.crud.pet_species import get_pet_species
from app.utils.pet_assets import sign_sprite_url

router = APIRouter(prefix="/pets", tags=["pets"])

@router.get("/species")
def species(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    owned_species = list_user_instances(db, session.user_id)
    owned_species_ids = {i.species_id for i in owned_species} 

    out = []

    species = get_pet_species(db)

    for s in species:
        owned = s.species_id in owned_species_ids
        entry = {
            "speciesId": s.species_id,
            "displayName": s.display_name,
            "rarity": s.rarity,
            "width": s.width,
            "height": s.height,
            "defaultSpeed": s.default_speed_x100 / 100,
            **s.config,
            "owned": owned
        }

        if owned:
            entry["spriteSheets"] = {
                beh: sign_sprite_url(session.user_id, s.species_id, beh) for beh in s.config["animations"].keys()
            }
        else:
            entry["previewUrl"] = f"/pets/assets/_silhouettes/{s.species_id}.png"

        out.append(entry)
    
    return {"ok": True, "species": out}

@router.get("/inventory")
def inventory(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    owned_species = list_user_instances(db, session.user_id)

    pets = []

    for s in owned_species:
        pets.append({
            "instanceId": s.instance_id,
            "speciesId": s.species_id,
            "nickname": s.nickname,
            "unlockedAt": s.unlocked_at,
            "active": s.active
        })

    return {"ok": True, "pets": pets}

class SetActiveBody(BaseModel):
    active: bool

@router.post("/{instance_id}/active")
def set_active_req(instance_id: str, body: SetActiveBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    instance = set_active(db, session.user_id, instance_id, body.active)

    return {"ok": True, "active": instance.active}