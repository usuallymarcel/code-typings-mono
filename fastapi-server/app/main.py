from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import env
from app.routes import users


app = FastAPI()

app.include_router(users.router)

origins = [
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