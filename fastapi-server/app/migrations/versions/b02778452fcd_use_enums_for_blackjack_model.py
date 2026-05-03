"""use enums for blackjack model (fixed)

Revision ID: b02778452fcd
Revises: c2b46f832a7f
Create Date: 2026-05-03

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = 'b02778452fcd'
down_revision: Union[str, Sequence[str], None] = 'c2b46f832a7f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # --- 1. Create ENUM types safely (lowercase values) ---
    game_status_enum = sa.Enum(
        'active', 'finished',
        name='game_status_enum'
    )
    game_phase_enum = sa.Enum(
        'player_turn', 'dealer_turn', 'finished',
        name='game_phase_enum'
    )
    game_result_enum = sa.Enum(
        'win', 'lose', 'push',
        name='game_result_enum'
    )

    game_status_enum.create(bind, checkfirst=True)
    game_phase_enum.create(bind, checkfirst=True)
    game_result_enum.create(bind, checkfirst=True)

    # --- 2. Add new column safely (handle existing rows) ---
    op.add_column(
        'blackjack',
        sa.Column('player_hand', postgresql.JSONB, nullable=True)
    )

    # Fill existing rows with default empty array
    op.execute("UPDATE blackjack SET player_hand = '[]'::jsonb")

    # Enforce NOT NULL after backfill
    op.alter_column('blackjack', 'player_hand', nullable=False)

    # --- 3. Convert VARCHAR -> ENUM (explicit cast required in Postgres) ---
    op.execute("""
        ALTER TABLE blackjack
        ALTER COLUMN status TYPE game_status_enum
        USING status::text::game_status_enum
    """)

    op.execute("""
        ALTER TABLE blackjack
        ALTER COLUMN phase TYPE game_phase_enum
        USING phase::text::game_phase_enum
    """)

    op.execute("""
        ALTER TABLE blackjack
        ALTER COLUMN result TYPE game_result_enum
        USING result::text::game_result_enum
    """)

    # --- 4. Fix index (keep or remove uniqueness depending on your logic) ---
    op.drop_index(op.f('ix_blackjack_user_id'), table_name='blackjack')

    # If only ONE game per user:
    op.create_index(op.f('ix_blackjack_user_id'), 'blackjack', ['user_id'], unique=True)

    # --- 5. Drop old column ---
    op.drop_column('blackjack', 'player_hands')


def downgrade() -> None:
    bind = op.get_bind()

    # --- 1. Recreate old column ---
    op.add_column(
        'blackjack',
        sa.Column('player_hands', postgresql.JSONB, nullable=True)
    )

    op.execute("UPDATE blackjack SET player_hands = player_hand")

    op.alter_column('blackjack', 'player_hands', nullable=False)

    # --- 2. Revert ENUM -> VARCHAR ---
    op.execute("""
        ALTER TABLE blackjack
        ALTER COLUMN status TYPE VARCHAR
        USING status::text
    """)

    op.execute("""
        ALTER TABLE blackjack
        ALTER COLUMN phase TYPE VARCHAR
        USING phase::text
    """)

    op.execute("""
        ALTER TABLE blackjack
        ALTER COLUMN result TYPE VARCHAR
        USING result::text
    """)

    # --- 3. Restore index ---
    op.drop_index(op.f('ix_blackjack_user_id'), table_name='blackjack')
    op.create_index(op.f('ix_blackjack_user_id'), 'blackjack', ['user_id'], unique=False)

    # --- 4. Drop new column ---
    op.drop_column('blackjack', 'player_hand')

    # --- 5. Drop ENUM types safely ---
    game_result_enum = sa.Enum(name='game_result_enum')
    game_phase_enum = sa.Enum(name='game_phase_enum')
    game_status_enum = sa.Enum(name='game_status_enum')

    game_result_enum.drop(bind, checkfirst=True)
    game_phase_enum.drop(bind, checkfirst=True)
    game_status_enum.drop(bind, checkfirst=True)