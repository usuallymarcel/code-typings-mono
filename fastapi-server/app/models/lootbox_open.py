from sqlalchemy import DateTime, ForeignKey, Integer, String, func

from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column


class LootboxOpen(Base):
    __tablename__ = "lootbox_opens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete="CASCADE"), index=True)

    sku: Mapped[str] = mapped_column(String(32))

    rolled_rarity: Mapped[str] = mapped_column(String(16))

    rolled_species: Mapped[str] = mapped_column(String(64))

    pet_instance_id: Mapped[int | None] = mapped_column(Integer)

    cost: Mapped[int] = mapped_column(Integer)

    opened_at: Mapped['DateTime'] = mapped_column(DateTime(timezone=True), server_default=func.now())