
from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Leaderboard(Base):
    __tablename__ = "leaderboard"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True
    )

    category: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    user = relationship("User")
    