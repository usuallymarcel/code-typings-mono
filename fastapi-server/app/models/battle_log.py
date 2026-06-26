from sqlalchemy import DateTime, ForeignKey, Integer, String, func

from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column


class Battle_Log(Base):
    __tablename__ = "battle_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    result: Mapped[str] = mapped_column(String(8))

    reward: Mapped[int] = mapped_column(Integer)

    trophies_after: Mapped[int] = mapped_column(Integer)

    enemy_tier: Mapped[int] = mapped_column(Integer)

    seed_hash: Mapped[str] = mapped_column(String(64))

    created_at: Mapped["DateTime"] = mapped_column(DateTime(timezone=True), server_default=func.now())
