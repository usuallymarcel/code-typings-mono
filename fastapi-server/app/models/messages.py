from sqlalchemy import String, Integer, TIMESTAMP, ForeignKey, func, UniqueConstraint, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from app.database import Base

class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    
    sender_name: Mapped[str] = mapped_column(
        String,
        nullable=False
    )

    content: Mapped[str] = mapped_column(
        String(2000),
        nullable=False
    )
    
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    __table_args__ = (
        Index(
            "ix_timestamp",
            "created_at"
        ),
    )
