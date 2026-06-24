import uuid

from app.database import Base
from sqlalchemy.orm import mapped_column, Mapped
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func

class Pet_Instance(Base):
    __tablename__ = "pet_instances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    instance_id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    species_id: Mapped[str] = mapped_column(ForeignKey("pet_species.species_id"), index=True)

    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)

    unlocked_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())

    active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    source: Mapped[str] = mapped_column(String(32), nullable=True) #e.g lootbox