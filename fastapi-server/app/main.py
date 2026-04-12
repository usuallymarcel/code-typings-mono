from fastapi import FastAPI
from app.config import env

app = FastAPI()

@app.get("/")
async def index():
    return {'piss': 'poo'}