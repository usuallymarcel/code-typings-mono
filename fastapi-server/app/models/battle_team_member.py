from app.database import Base
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import DateTime, ForeignKey, Integer, func, String, UniqueConstraint
from app.models.pet_instance import Pet_Instance 

class Battle_Team_Member(Base):
    __tablename__ = "battle_team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    team_id: Mapped[int] = mapped_column(ForeignKey("battle_teams.id", ondelete="CASCADE"), nullable=False)
    
    pet_instance_id: Mapped[str] = mapped_column(String(36), ForeignKey("pet_instances.instance_id", ondelete="CASCADE"), nullable=False)

    slot: Mapped[int] = mapped_column(Integer, nullable=False)

    updated_at: Mapped["DateTime"] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    team = relationship("Battle_Team", back_populates="members")
    pet_instance: Mapped[Pet_Instance] = relationship("Pet_Instance")

    __table_args__ = (
        UniqueConstraint("team_id", "slot"),
        UniqueConstraint("team_id", "pet_instance_id"),
    )