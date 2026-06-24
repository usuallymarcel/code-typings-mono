from sqlalchemy.exc import IntegrityError

from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from app.crud.lootboxes import get_lootbox, list_enabled
from app.utils.session_tokens import get_session_from_request
from app.crud.user_points import get_points_by_user_id, update_user_points
from app.utils.lootbox_roll import roll
from app.crud.pets import create_instance
from app.models.lootbox_open import LootboxOpen
from app.utils.pet_assets import sign_sprite_urls_for_species


router = APIRouter(prefix="/lootboxes", tags=["lootboxes"])

@router.get("")
def list_boxes(request: Request, db = Depends(get_db)):
    get_session_from_request(db, request)

    boxes = list_enabled(db)

    out = []

    for box in boxes:
        out.append({
            "sku": box.sku,
            "name": box.name,
            "price": box.price,
            "odds": {k: v for k, v in box.drop_table["rarities"].items()}
        })

    return { "ok": True, "boxes": out}

@router.post("/{sku}/open")
def open_box(sku: str, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    box = get_lootbox(db, sku)

    if not box:
        raise HTTPException(404, 'Lootbox not found')
    
    try:
        pts = get_points_by_user_id(db, session.user_id)

        if pts.points < box.price:
            raise HTTPException(400, "not enough points")
        
        remaining = pts.points - box.price
        update_user_points(db, session.user_id, remaining)

        rarity, species_id, seed_hash = roll(db, session.user_id, box)

        instance = create_instance(db, session.user_id, species_id, source=f"lootbox:{sku}")

        db.add(LootboxOpen(
            user_id=session.user_id,
            sku=sku,
            rolled_rarity=rarity,
            rolled_species=species_id,
            pet_instance_id=instance.id,
            cost=box.price,
        ))
        db.commit()
        db.refresh(instance)
    except HTTPException:
        db.rollback(); raise
    except Exception:
        db.rollback()
        raise HTTPException(500, 'Could not open lootbox')
    
    pool = []
    seen = set()
    for pool_rarity, species_ids in box.drop_table.get("speciesByRarity", {}).items():
        for sid in species_ids:
            if sid in seen:
                continue
            seen.add(sid)
            pool.append({
                "speciesId": sid,
                "rarity": pool_rarity,
                "previewUrl": f"/pet-assets/_silhouettes/{sid}.png"
            })
    
    return {
        "ok": True,
        "rolled": {
            "rarity": rarity,
            "speciesId": species_id,
            "instanceId": instance.instance_id,
            "spriteSheets": sign_sprite_urls_for_species(db, session.user_id, species_id),
        },
        "pool": pool,
        "pointsRemaining": remaining
    }
    
