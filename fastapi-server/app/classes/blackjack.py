import copy
import random

from app.models.blackjack import Blackjack as BlackjackModel, GameResult, GameStatus, GamePhase

from typing import TypedDict, Literal, List, Optional

class Card(TypedDict):
    rank: Literal["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
    suit: Literal["hearts", "diamonds", "spades", "clubs"]

Deck = List[Card]
Hand = List[Card]

class BlackjackEngine:
    def __init__(self, bet_amount: int, deck: Deck, player_hand: Hand, dealer_hand: Hand, status: GameStatus, phase: GamePhase, result: Optional[GameResult] = None):
        self.bet_amount = bet_amount
        self.deck = deck
        self.player_hand = player_hand
        self.dealer_hand = dealer_hand
        self.phase = phase
        self.status = status
        self.result = result

    @classmethod
    def new_game(cls, bet_amount: int):
        deck = cls._create_deck()
        random.shuffle(deck)

        player_hand = [deck.pop(), deck.pop()]
        dealer_hand = [deck.pop(), deck.pop()]

        return cls(
            bet_amount = bet_amount,
            deck = deck,
            player_hand=player_hand,
            dealer_hand=dealer_hand,
            status=GameStatus.ACTIVE,
            phase=GamePhase.PLAYER_TURN
        )
    
    @classmethod
    def from_db(cls, db_game: BlackjackModel):
        return cls(
            bet_amount=db_game.bet_amount,
            deck=db_game.deck_state,
            player_hand=db_game.player_hand,
            dealer_hand=db_game.dealer_hand,
            status=db_game.status,
            phase=db_game.phase,
            result=db_game.result
        )
    

    def hit(self):
        if self.phase != GamePhase.PLAYER_TURN:
            return
        
        self.player_hand.append(self.deck.pop())

        if self._hand_value(self.player_hand) > 21:
            self.status = GameStatus.FINISHED
            self.phase = GamePhase.FINISHED
            self.result = GameResult.LOSE
            
    def stand(self):
        if self.phase != GamePhase.PLAYER_TURN:
            return
        
        self.phase = GamePhase.DEALER_TURN
        self._dealer_play()
        self._resolve()

    def _dealer_play(self):
        while self._hand_value(self.dealer_hand) < 17:
            self.dealer_hand.append(self.deck.pop())

    def _resolve(self):
        player_score = self._hand_value(self.player_hand)
        dealer_score = self._hand_value(self.dealer_hand)

        if dealer_score > 21 or player_score > dealer_score:
            self.result = GameResult.WIN
        elif player_score < dealer_score:
            self.result = GameResult.LOSE
        else:
            self.result = GameResult.PUSH

        self.phase = GamePhase.FINISHED
        self.status = GameStatus.FINISHED

    @staticmethod
    def _hand_value(hand: Hand):
        value = 0
        aces = 0

        for card in hand:
            rank = card['rank']

            if rank in ['J', 'Q', 'K']:
                value += 10
            elif rank == 'A':
                aces += 1
                value += 11
            else:
                value += int(rank)

        while value > 21 and aces:
            value -= 10
            aces -= 1

        return value

    @staticmethod
    def _create_deck():
        suits = ["hearts", "diamonds", "spades", "clubs"]
        ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]

        return [{"rank": r, "suit": s} for s in suits for r in ranks]
    

    def to_dict(self):
        return {
            "bet_amount": self.bet_amount,
            "deck_state": self.deck,
            "player_hand": self.player_hand,
            "dealer_hand": self.dealer_hand,
            "status": self.status,
            "phase": self.phase,
            "result": self.result
        }
    
    def to_model(self, user_id: int):
        return BlackjackModel(
            user_id=user_id,
            **self.to_dict()
        )
    
    def apply_to_model(self, db_game: BlackjackModel):
        db_game.bet_amount = self.bet_amount
        db_game.deck_state = copy.deepcopy(self.deck)
        db_game.player_hand = copy.deepcopy(self.player_hand)
        db_game.dealer_hand = copy.deepcopy(self.dealer_hand)
        db_game.status = self.status
        db_game.phase = self.phase
        db_game.result = self.result
    
    def to_response(self):
        if self.phase == GamePhase.DEALER_TURN or self.phase == GamePhase.FINISHED:
            dealer_hand_res = self.dealer_hand
        else:
            dealer_hand_res = [self.dealer_hand[0]]

        return {
            "player_hand": self.player_hand,
            "dealer_hand": dealer_hand_res,
            "status": self.status,
            "phase": self.phase,
            "result": self.result,
            "bet_amount": self.bet_amount
        }