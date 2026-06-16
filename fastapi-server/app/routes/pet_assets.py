import base64
import hashlib
import hmac
import os
import time

from fastapi.responses import FileResponse
from app.config import env
from fastapi import APIRouter, Depends, HTTPException, Request
from app.database import get_db
from app.utils.session_tokens import get_session_from_request
from app.crud.pet_instance import get_pet_instance_by_user_id

router = APIRouter(prefix="/pet-assets", tags=["pet-assets"])

ASSETS_DIR = os.path.abspath(env.pet_assets_dir)

@router.get("/{species_id}/{behavior}.png")
def serve_sprite(species_id: str, behavior: str, request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    try:
        uid = int(request.query_params["uid"])
        exp = int(request.query_params["exp"])
        sig = request.query_params["sig"]
    except (KeyError, ValueError):
        raise HTTPException(400, "Bad asset URL")
    
    if uid != session.user_id:
        raise HTTPException(403)

    if exp < time.time():
        raise HTTPException(403, "Asset link expired")
    
    payload = f"{uid}|{species_id}|{behavior}|{exp}".encode()

    expected = base64.urlsafe_b64encode(
        hmac.new(env.pet_assets_secret.encode(), payload, hashlib.sha256).digest()
    ).rstrip(b"=").decode()

    if not hmac.compare_digest(expected, sig):
        raise HTTPException(403)
    
    owned = get_pet_instance_by_user_id(db, uid, species_id)

    if not owned:
        raise HTTPException(403)
    
    abs_path = os.path.abspath(os.path.join(ASSETS_DIR, species_id, f"{behavior}.png"))

    if not abs_path.startswith(ASSETS_DIR + os.sep):
        raise HTTPException(400)
    
    if not os.path.isfile(abs_path):
        raise HTTPException(404)
    
    return FileResponse(abs_path, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})

