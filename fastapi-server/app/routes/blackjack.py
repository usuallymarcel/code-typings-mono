

import random

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.classes.blackjack import BlackjackEngine
from app.crud.blackjack import create_game, delete_game_by_user_id, get_game_by_user_id, save_game
from app.crud.user_points import get_points_by_user_id, update_user_points
from app.database import get_db
from app.models.blackjack import Blackjack, GameResult, GameStatus
from app.utils.session_tokens import get_session_from_request

from enum import Enum

router = APIRouter(prefix='/blackjack', tags=['blackjack'])

class StartGameRequest(BaseModel):
    bet_amount: int = Field(gt=0)

class Action(str, Enum):
    HIT = "hit"
    STAND = "stand"

class GameAction(BaseModel):
    action: Action


@router.post('/start')
def start_game(request: Request, data: StartGameRequest, db = Depends(get_db)):
    session = get_session_from_request(db, request)
    current = get_game_by_user_id(db, session.user_id)

    if current:
        if current.status != 'finished':
            return {'ok': True, 'game': current}
        
        if current.status == GameStatus.FINISHED:
            delete_game_by_user_id(db, session.user_id)

    user_points = get_points_by_user_id(db, session.user_id)

    if user_points.points < data.bet_amount:
        return {'ok': False, 'message': 'Bet Amount Invalid'}

    game = BlackjackEngine.new_game(data.bet_amount)
    create_game(db, game.to_model(session.user_id))

    new_points = user_points.points - game.bet_amount

    update_user_points(db, session.user_id, new_points)
    db.commit()

    return {'ok': True, 'game': game.to_response(), 'points': new_points}

@router.get('')
def get_game(request: Request, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    game = get_game_by_user_id(db, session.user_id)

    if not game:
        return {'ok': True, 'game': None}
    
    engine = BlackjackEngine.from_db(game)

    return {'ok': True, 'game': engine.to_response()}

@router.post('')
def hit(request: Request, data: GameAction, db = Depends(get_db)):
    session = get_session_from_request(db, request)

    game = get_game_by_user_id(db, session.user_id)

    if not game:
        return {'ok': False, 'message': 'No current game', 'game': None}

    if game.status == GameStatus.FINISHED:
        return {'ok': False, 'message': 'Game Finished', 'game': None}

    engine = BlackjackEngine.from_db(game)

    if data.action == Action.HIT:
        engine.hit()        
    else:
        engine.stand()
        
    # STUPID HACK BECAUSE IM TOO LAZY TO PROPERLY FIX THIS RN SQLALCHEMY DOESN'T TRACK JSONB PROPERLY FOR CHANGES
    db.query(Blackjack).filter(
        Blackjack.user_id == session.user_id
    ).update({
        Blackjack.bet_amount: engine.bet_amount,
        Blackjack.deck_state: engine.deck,
        Blackjack.player_hand: engine.player_hand,
        Blackjack.dealer_hand: engine.dealer_hand,
        Blackjack.status: engine.status,
        Blackjack.phase: engine.phase,
        Blackjack.result: engine.result,
    })

    db.commit()

    if engine.status == GameStatus.FINISHED:
        user_points = get_points_by_user_id(db, session.user_id)

        if engine.result == GameResult.WIN:
            new_points = user_points.points + (engine.bet_amount * 2)
        elif engine.result == GameResult.PUSH:
            new_points = user_points.points + engine.bet_amount
        else:
            new_points = user_points.points

        update_user_points(db, session.user_id, new_points)
        db.commit()

    return {'ok': True, 'game': engine.to_response()}
            