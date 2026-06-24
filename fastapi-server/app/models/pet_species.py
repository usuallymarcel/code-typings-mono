from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Integer, String, JSON

class Pet_Species(Base):
    __tablename__ = "pet_species"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    species_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    display_name: Mapped[str] = mapped_column(String(128), nullable=False)

    rarity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)

    width: Mapped[int] = mapped_column(Integer, nullable=False)

    height: Mapped[int] = mapped_column(Integer, nullable=False)

    default_speed_x100: Mapped[int] = mapped_column(Integer, nullable=False)

    config: Mapped[dict] = mapped_column(JSON, nullable=False)

    enabled: Mapped[bool] = mapped_column(default=True)
