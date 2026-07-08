from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import DateTime, Integer, ForeignKey, func

class Battle_Profile(Base):
    __tablename__ = "battle_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)

    highest_trophy: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )