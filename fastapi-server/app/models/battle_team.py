from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column, Unique, relationship
from sqlalchemy import DateTime, ForeignKey, Integer, func, String, UniqueConstraint

class Battle_Team(Base):
    __tablename__ = "battle_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True)
    
    name: Mapped[str] = mapped_column(String(64), nullable=False)

    trophies: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    wins: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    losses: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name")
    )

    members = relationship(
        "Battle_Team_Member",
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="Battle_Team_Member.slot"
    )