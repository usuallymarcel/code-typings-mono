from pydantic import BaseModel

from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import get_pet_instance, list_user_instances, set_active, set_nickname
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

        entry["previewUrl"] = f"/pet-assets/_silhouettes/{s.species_id}.png"
        if owned:
            entry["spriteSheets"] = {
                beh: sign_sprite_url(session.user_id, s.species_id, beh) for beh in s.config["animations"].keys()
            }
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

class SetNicknameBody(BaseModel):
    nickname: str

@router.post("/{instance_id}/nickname")
def set_pet_nickname(instance_id: str, body: SetNicknameBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    instance = get_pet_instance(db, session.user_id, instance_id)

    if not instance:
        raise HTTPException(404, 'pet instance not found')

    if instance.nickname != None:
        raise HTTPException(400, "nickname already set")

    instance = set_nickname(db, session.user_id, instance_id, body.nickname)

    return {"ok": True, "instance":instance}