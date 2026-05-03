from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class User_Theme(Base):
    __tablename__ = "user_themes"

    __table_args__ = (
        UniqueConstraint("user_id", "theme", name="uq_user_theme"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    theme: Mapped[str] = mapped_column(
        String,
        nullable=False
    )