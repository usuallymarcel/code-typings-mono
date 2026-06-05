from app.database import Base
from sqlalchemy import JSON, Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

class Lootbox(Base):
    __tablename__ = "lootboxes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    sku: Mapped[str] = mapped_column(String(32), unique=True)

    name: Mapped[str] = mapped_column(String(128), nullable=False)

    price: Mapped[int] = mapped_column(Integer, nullable=False)
    
    drop_table: Mapped[dict] = mapped_column(JSON, nullable=False)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)