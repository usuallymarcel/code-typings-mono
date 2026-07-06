from pydantic import BaseModel

from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import get_pet_instance, list_user_instances, merge_pets, set_active, set_nickname
from app.crud.pet_species import get_pet_species
from app.utils.pet_assets import sign_sprite_url
from app.crud.pet_instance import get_pet_instance_by_id, get_pet_instances

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
            "active": s.active,
            "source": s.source
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

class MergeRequestBody(BaseModel):
    target_id: str
    sacrifices: list[str]

@router.post("/merge")
def merge_pets_req(body: MergeRequestBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    target = get_pet_instance_by_id(db, session.user_id, body.target_id)


    if not target:
        raise HTTPException(404, "target not found")
    
    if body.target_id in body.sacrifices:
        raise HTTPException(400, "connot merge pet into itself")
    
    sacrifices_needed = min(target.level * 3, 5)

    if len(body.sacrifices) != sacrifices_needed:
        raise HTTPException(400, "wrong amount of sacrifices")

    sacrifices = get_pet_instances(db, session.user_id, body.sacrifices)

    sacrifice_map = {s.instance_id: s for s in sacrifices}

    seen: set[str] = set()

    for id in body.sacrifices:
        s = sacrifice_map.get(id)

        if not s:
            raise HTTPException(404, f"sacrifice {id} not found")
        
        if s in seen:
            raise HTTPException(400, "duplicates in your sacrifices")
        
        if s.species_id != target.species_id:
            raise HTTPException(400, f"target and sacrifice {id} are different species")
        
        seen.add(id)

    try:
        updated = merge_pets(db, session.user_id, body.target_id, body.sacrifices)
        db.commit()
        db.refresh(updated)
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "could not merge pets")
    
    return {
        "ok": True,
        "target": updated
    }
    

    

