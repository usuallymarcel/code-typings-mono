from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, func

class Battle_Profile(Base):
    __tablename__ = "battle_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True)

    trophies: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    losses: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    team: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )