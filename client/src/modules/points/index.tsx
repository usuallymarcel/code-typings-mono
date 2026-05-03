import { useEffect, useState } from "react";
import { OutlineButton } from "../../components/outline-button";
import { usePointsContext } from "./contexts/PointsContext";

type Card = {
  rank: string;
  suit: string;
};

type GameStatus = "active" | "finished";
type GamePhase = "player_turn" | "dealer_turn" | "finished";
type GameResult = "win" | "lose" | "push" | null;

type Game = {
  player_hand: Card[];
  dealer_hand: Card[];
  status: GameStatus;
  phase: GamePhase;
  result: GameResult;
  bet_amount: number;
};

function CardView({ card }: { card: Card }) {
  const suitSymbol = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
  }[card.suit];

  const isRed = card.suit === "hearts" || card.suit === "diamonds";

  return (
    <div
      className={`w-10 h-14 rounded bg-white flex flex-col items-center justify-center text-sm font-bold shadow ${
        isRed ? "text-red-500" : "text-black"
      }`}
    >
      <div>{card.rank}</div>
      <div>{suitSymbol}</div>
    </div>
  );
}

const normalizePoints = (p: any) =>
  typeof p === "object" ? p.points : p;

export default function Blackjack() {
  const { points, setPoints } = usePointsContext();

  const [game, setGame] = useState<Game | null>(null);
  const [bet, setBet] = useState(1);
  const [loading, setLoading] = useState(false);

  const [displayPoints, setDisplayPoints] = useState(points);
  const [revealDealer, setRevealDealer] = useState(false);

  const isFinished = game?.status === "finished";
  const isActive = game?.status === "active";

  async function fetchGame() {
    const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/blackjack`, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.ok) setGame(data.game);
  }

  useEffect(() => {
    fetchGame();
  }, []);

  useEffect(() => {
    if (points === null) return;

    let start = displayPoints ?? points;
    let end = points;

    if (start === end) return;

    const steps = 20;
    let current = start;
    let i = 0;

    const interval = setInterval(() => {
      i++;
      current += (end - start) / steps;

      if (i >= steps) {
        setDisplayPoints(end);
        clearInterval(interval);
      } else {
        setDisplayPoints(Math.round(current));
      }
    }, 20);

    return () => clearInterval(interval);
  }, [points]);

  async function startGame() {
    setLoading(true);
    setRevealDealer(false);

    const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/blackjack/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ bet_amount: bet }),
    });

    const data = await res.json();

    if (data.ok) {
      setGame(data.game);
      if (data.points !== undefined) setPoints(data.points);
    }

    setLoading(false);
  }

  async function action(type: "hit" | "stand") {
    const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/blackjack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: type }),
    });

    const data = await res.json();

    if (!data.ok) return;

    setGame(data.game);

    if (data.game.status === "finished") {
      setRevealDealer(true);

      const p = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/points`, {
        credentials: "include",
      });

      const data = await p.json()

      setPoints(data.points.points);
    }
  }

  function resetRound() {
    setGame(null);
    setRevealDealer(false);
  }

  return (
    <div className="flex items-center justify-center p-10 text-white bg-neutral-900 rounded-xl">
      <div className="flex flex-col gap-4 w-85">

        {/* Points */}
        <div className="text-center text-2xl font-bold">
          {displayPoints ?? 0} pts
        </div>

        {/* START SCREEN (only when no active game) */}
        {!game && (
          <div className="flex flex-col gap-2">
            <input
              type="number"
              min={1}
              value={bet}
              onChange={(e) => setBet(Number(e.target.value))}
              className="p-2 rounded bg-neutral-800 text-white"
            />
            <OutlineButton onClick={startGame} disabled={loading}>
              Start Game
            </OutlineButton>
          </div>
        )}

        {/* GAME SCREEN (active OR finished) */}
        {game && (
          <>
            {/* Dealer */}
            <div>
              <p className="text-sm opacity-70">Dealer</p>
              <div className="flex gap-2">
                {game.dealer_hand.map((c, i) => {
                  const hidden = i === 1 && isActive && !revealDealer;

                  return hidden ? (
                    <div
                      key={i}
                      className="w-10 h-14 rounded bg-neutral-700 shadow-inner"
                    />
                  ) : (
                    <CardView key={i} card={c} />
                  );
                })}
              </div>
            </div>

            {/* Player */}
            <div>
              <p className="text-sm opacity-70">You</p>
              <div className="flex gap-2">
                {game.player_hand.map((c, i) => (
                  <CardView key={i} card={c} />
                ))}
              </div>
            </div>

            {/* Result (only when finished) */}
            {isFinished && (
              <p className="text-center text-lg font-bold">
                {game.result?.toUpperCase()}
              </p>
            )}

            {/* Actions */}
            {isActive && (
              <div className="flex gap-2 justify-center">
                <OutlineButton onClick={() => action("hit")}>
                  Hit
                </OutlineButton>
                <OutlineButton onClick={() => action("stand")}>
                  Stand
                </OutlineButton>
              </div>
            )}

            {/* NEW ROUND BUTTON */}
            {isFinished && (
              <div className="flex justify-center">
                <OutlineButton onClick={resetRound}>
                  New Game
                </OutlineButton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}