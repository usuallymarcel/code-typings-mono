import { useEffect, useState } from "react"
import { OutlineButton } from "../../components/outline-button"
import { usePointsContext } from "./contexts/PointsContext"

type Card = {
rank: string
suit: string
}

type GameStatus = "active" | "finished"
type GamePhase = "player_turn" | "dealer_turn" | "finished"
type GameResult = "win" | "lose" | "push" | null

type Game = {
    player_hand: Card[]
    dealer_hand: Card[]
    status: GameStatus
    phase: GamePhase
    result: GameResult
    bet_amount: number
}

type GameRes = {
    ok: boolean,
    game: Game,
    points?: number
}

    /* ---------------- CARD ---------------- */

function CardView({ card }: { card: Card }) {
    const suitSymbol = {
        hearts: "♥",
        diamonds: "♦",
        clubs: "♣",
        spades: "♠",
    }[card.suit]

    const isRed = card.suit === "hearts" || card.suit === "diamonds"

    return (
        <div
        className={`w-10 h-14 rounded bg-white flex flex-col items-center justify-center text-sm font-bold shadow ${
            isRed ? "text-red-500" : "text-black"
        }`}
        >
        <div>{card.rank}</div>
        <div>{suitSymbol}</div>
        </div>
    )
}

    /* ---------------- MAIN ---------------- */

export default function Blackjack() {
    const { points, setPoints } = usePointsContext()

    const [game, setGame] = useState<Game | null>(null)
    const [bet, setBet] = useState(1)
    const [loading, setLoading] = useState(false)

    const [displayPoints, setDisplayPoints] = useState(points)

    // dealer animation
    const [visibleDealerCount, setVisibleDealerCount] = useState(1)
    const [revealDealer, setRevealDealer] = useState(false)

    const isFinished = game?.status === "finished"
    const isActive = game?.status === "active"

    /* ---------------- FETCH GAME ---------------- */

    async function fetchGame() {
        const res = await fetch(
        `${import.meta.env.VITE_FASTAPI_API_URL}/blackjack`,
        { credentials: "include" }
        )

        const data = await res.json() as GameRes

        // if (data.ok) {
        if (data.ok && data.game.status !== 'finished') {
            setGame(data.game)
        }
    }

    useEffect(() => {
        fetchGame()
    }, [])

    /* ---------------- POINT ANIMATION ---------------- */

    useEffect(() => {
        if (points === null) return

        const start = displayPoints ?? points
        const end = points

        if (start === end) return

        let current = start
        let i = 0

        const steps = 20

        const interval = setInterval(() => {
        i++
        current += (end - start) / steps

        if (i >= steps) {
            setDisplayPoints(end)
            clearInterval(interval)
        } else {
            setDisplayPoints(Math.round(current))
        }
        }, 20)

        return () => clearInterval(interval)
    }, [points])

    /* ---------------- START GAME ---------------- */

    async function startGame() {
        setLoading(true)
        setRevealDealer(false)
        setVisibleDealerCount(1)

        const res = await fetch(
        `${import.meta.env.VITE_FASTAPI_API_URL}/blackjack/start`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ bet_amount: bet }),
        }
        )

        const data = await res.json() as GameRes

        if (data.ok) {
        
        setGame(data.game)
        if (data.points !== undefined) setPoints(data.points)
        }

        setLoading(false)
    }

    /* ---------------- ACTIONS ---------------- */

    async function action(type: "hit" | "stand") {
        const res = await fetch(
        `${import.meta.env.VITE_FASTAPI_API_URL}/blackjack`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: type }),
        }
        )

        const data = await res.json() as GameRes

        if (!data.ok) return

        setGame(data.game)

        if (data.game.status === "finished") {
        setRevealDealer(true)
        setVisibleDealerCount(1)

        const p = await fetch(
            `${import.meta.env.VITE_FASTAPI_API_URL}/points`,
            { credentials: "include" }
        )

        const pData = await p.json()
        setPoints(pData.points.points)
        }
    }

    /* ---------------- DEALER ANIMATION ---------------- */

    useEffect(() => {
        if (!isFinished || !game?.dealer_hand) return

        setVisibleDealerCount(1)

        let i = 1

        const interval = setInterval(() => {
        i++
        setVisibleDealerCount(i)

        if (i >= game.dealer_hand.length) {
            clearInterval(interval)
        }
        }, 500)

        return () => clearInterval(interval)
    }, [isFinished, game?.dealer_hand])

    /* ---------------- RESET ---------------- */

    function resetRound() {
        setGame(null)
        setRevealDealer(false)
        setVisibleDealerCount(1)
    }

    /* ---------------- UI ---------------- */

    return (
        <div className="flex items-center justify-center p-10 [background:var(--bg)] rounded-xl border">
        <div className="flex flex-col gap-4 w-85">

            {/* POINTS */}
            <div className="text-center text-2xl font-bold">
            {displayPoints ?? 0} pts
            </div>

            {/* START SCREEN */}
            {!game && (
            <div className="flex flex-col gap-2">
                <input
                type="number"
                min={1}
                value={bet}
                onChange={(e) => setBet(Number(e.target.value))}
                className="p-2 rounded bg-[var(--button-bg-bg)]"
                />
                <OutlineButton onClick={startGame} disabled={loading}>
                Start Game
                </OutlineButton>
            </div>
            )}

            {/* GAME SCREEN */}
            {game && (
            <>
                {/* DEALER */}
                <div>
                <p className="text-sm opacity-70">Dealer</p>

                <div className="flex gap-2">
                    {game.dealer_hand.map((card, i) => {
                    const hiddenHoleCard =
                        i === 1 && isActive && !revealDealer

                    const visible =
                        isFinished
                        ? i < visibleDealerCount
                        : !hiddenHoleCard

                    if (!visible) {
                        return (
                        <div
                            key={i}
                            className="w-10 h-14 rounded bg-neutral-700 shadow-inner"
                        />
                        )
                    }

                    return (
                        <div
                        key={i}
                        className={isFinished ? "animate-dealer-card" : ""}
                        >
                        <CardView card={card} />
                        </div>
                    )
                    })}
                </div>
                </div>

                {/* PLAYER */}
                <div>
                <p className="text-sm opacity-70">You</p>
                <div className="flex gap-2">
                    {game.player_hand.map((c, i) => (
                    <CardView key={i} card={c} />
                    ))}
                </div>
                </div>

                {/* RESULT */}
                {isFinished && (
                <p className="text-center text-lg font-bold">
                    {game.result?.toUpperCase()}
                </p>
                )}

                {/* ACTIONS */}
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

                {/* NEW GAME */}
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
    )
}