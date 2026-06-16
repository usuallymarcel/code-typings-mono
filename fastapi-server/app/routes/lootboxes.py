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
            "displayName": box.name,
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
        with db.begin_nested():
            pts = get_points_by_user_id(db, session.user_id)

            if pts.points < box.price:
                raise HTTPException(400, "not enough points")
            
            update_user_points(db, session.user_id, pts.points - box.price)

            rarity, species_id, seed_hash = roll(db, session.user_id, box)

            instance = create_instance(db, session.user_id, species_id, source=f"lootbox:{sku}")

            db.add(LootboxOpen(
                user_id=session.user_id,
                sku=sku,
                rolled_rarity=rarity,
                rolled_species=species_id,
                pet_instance_id=instance.id,
                cost=box.price,
                server_seed_hash=seed_hash
            ))
            db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(500, 'Could not open lootbox')
    
    return {
        "ok": True,
        "rolled": {
            "rarity": rarity,
            "speciesId": species_id,
            "instanceId": instance.id,
            "spriteSheets": sign_sprite_urls_for_species(db, session.user_id, species_id),
        },
        "pointsRemaining": pts.points - box.price
    }
    
