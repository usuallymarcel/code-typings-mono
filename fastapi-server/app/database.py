from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker, DeclarativeBase
from typing import Generator

from app.config import env

engine = create_engine(
    env.database_url,
    echo=False,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False
)

class Base(DeclarativeBase):
    pass

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()