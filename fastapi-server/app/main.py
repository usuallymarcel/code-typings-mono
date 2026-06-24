from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import env
from app.routes import blackjack, messages, points, themes, users, ws
from app.routes import leaderboard
from app.routes import pets
from app.routes import lootboxes
from app.routes import pet_assets

app = FastAPI()

app.include_router(users.router)
app.include_router(leaderboard.router)
app.include_router(points.router)
app.include_router(blackjack.router)
app.include_router(themes.router)
app.include_router(ws.router)
app.include_router(messages.router)
app.include_router(pets.router)
app.include_router(lootboxes.router)
app.include_router(pet_assets.router)

origins = [
    'http://localhost:5173',
    'http://localhost:8000',
    'https://typings.marcel.co.nz'
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

# @app.get("/")
# async def index():
#     return {'piss': 'poo'}