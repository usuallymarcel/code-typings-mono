from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime, ForeignKey, Index, Integer, func, UniqueConstraint

class Battle_Team_Member(Base):
    __tablename__ = "battle_team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    team_id: Mapped[int] = mapped_column(ForeignKey("battle_teams.id", ondelete="CASCADE"), nullable=False)
    
    pet_instance_id: Mapped[int] = mapped_column(ForeignKey("pet_instances.id", ondelete="CASCADE"), nullable=False)

    slot: Mapped[int] = mapped_column(Integer, nullable=False)

    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    team = relationship("Battle_Team", back_populates="members")
    pet_instance = relationship("Pet_Instance")

    __table_args__ = (
        UniqueConstraint("team_id", "slot"),
        UniqueConstraint("team_id", "pet_instance_id")
    )

    Index("ix_team_user", "user_id")
    Index("ix_member_team", "team_id")