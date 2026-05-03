
from datetime import datetime

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, func, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base

from enum import Enum

class GameStatus(str, Enum):
    ACTIVE = "active"
    FINISHED = "finished"

class GamePhase(str, Enum):
    PLAYER_TURN = "player_turn"
    DEALER_TURN = "dealer_turn"
    FINISHED = "finished"

class GameResult(str, Enum):
    WIN = "win"
    LOSE = "lose"
    PUSH = "push"

class Blackjack(Base):
    __tablename__ = "blackjack"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True
    )

    status: Mapped[GameStatus] = mapped_column(
        SQLEnum(
            GameStatus,
            name="game_status_enum",
            values_callable=lambda enum: [e.value for e in enum],
        ),
        nullable=False
    )

    phase: Mapped[GamePhase] = mapped_column(
        SQLEnum(
            GamePhase,
            name="game_phase_enum",
            values_callable=lambda enum: [e.value for e in enum],
        ),
        nullable=False
    )

    player_hand: Mapped[list] = mapped_column(JSONB, nullable=False)
    dealer_hand: Mapped[list] = mapped_column(JSONB, nullable=False)
    deck_state: Mapped[list] = mapped_column(JSONB, nullable=False)

    bet_amount: Mapped[int] = mapped_column(Integer, nullable=False)

    result: Mapped[GameResult] = mapped_column(
        SQLEnum(
            GameResult,
            name="game_result_enum",
            values_callable=lambda enum: [e.value for e in enum],
        ),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    user = relationship("User")