from pydantic import BaseModel

from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from app.utils.session_tokens import get_session_from_request
from app.crud.pets import list_user_instances, set_active, merge_instances
from app.crud.pet_species import get_pet_species
from app.utils.pet_assets import sign_sprite_url
from app.utils.battle_engine import level_for_xp, RARITY_BASE

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
            "level": s.level,
            "xp": s.xp
        })

    return {"ok": True, "pets": pets}

class SetActiveBody(BaseModel):
    active: bool

@router.post("/{instance_id}/active")
def set_active_req(instance_id: str, body: SetActiveBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    instance = set_active(db, session.user_id, instance_id, body.active)

    return {"ok": True, "active": instance.active}

class MergeBody(BaseModel):
    targetInstanceId: str
    sacrificeInstanceId: str


@router.post("/merge")
def merge_req(body: MergeBody, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    if body.targetInstanceId == body.sacrificeInstanceId:
        raise HTTPException(400, "cannot merge a pet into itself")

    instances_by_id = {i.instance_id: i for i in list_user_instances(db, session.user_id)}

    target = instances_by_id.get(body.targetInstanceId)
    sacrifice = instances_by_id.get(body.sacrificeInstanceId)

    # Ownership is enforced by only consulting the user-scoped map, so an id that
    # belongs to another user is indistinguishable from one that does not exist.
    if target is None or sacrifice is None:
        raise HTTPException(404, "pet not found")

    if target.species_id != sacrifice.species_id:
        raise HTTPException(400, "pets must be the same species to merge")

    if target.xp >= 5:
        raise HTTPException(400, "target pet is already at the maximum level")

    species_by_id = {s.species_id: s for s in get_pet_species(db)}
    species = species_by_id.get(target.species_id)
    if species is None:
        raise HTTPException(400, "pet species is not available")

    try:
        updated = merge_instances(db, session.user_id, body.targetInstanceId, body.sacrificeInstanceId)
        db.commit()
        db.refresh(updated)
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not merge pets")

    xp = updated.xp
    level = level_for_xp(xp)
    base_attack, base_health = RARITY_BASE.get(species.rarity, (2, 3))
    config = species.config or {}
    attack = int(config.get("baseAttack", base_attack)) + xp
    health = int(config.get("baseHealth", base_health)) + xp

    return {
        "ok": True,
        "target": {
            "instanceId": updated.instance_id,
            "speciesId": updated.species_id,
            "level": level,
            "xp": xp,
            "attack": attack,
            "health": health,
        },
    }