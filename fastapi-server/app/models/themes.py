from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class Theme(Base):
    __tablename__ = "themes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
        index=True
    )

    price: Mapped[int] = mapped_column(
        Integer,
        nullable=False
    )