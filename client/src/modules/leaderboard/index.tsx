import { useState, useEffect } from "react"
import { lengths } from "../typing/components/constants"

type LeaderboardEntry = {
    user_id: number
    score: number
    category: string
    user: User
}

type User = {
    id: number
    name: string
}

type res = {
    ok: boolean
    leaderboard: LeaderboardEntry[]
}

export function Leaderboard({length}: {length?: number}) {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [selected, setSelected] = useState(length ?? 10)

    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const serverUrl = import.meta.env.VITE_FASTAPI_API_URL as string
                const baseUrl = serverUrl.includes('localhost') ? '' : window.location.href
                const url = new URL(`${baseUrl + serverUrl}/leaderboard`)

                url.searchParams.append('category', selected.toString())

                const res = await fetch(url)

                const data = (await res.json()) as res

                setLeaderboard(data.leaderboard)
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message)
                }
            }
        }

        fetchLeaderboard()
    }, [selected])

    return (
        <div className='flex items-center justify-center p-20 text-white bg-neutral-900 rounded-xl border'>
            <div className="w-full max-w-md">
                <h2 className="text-xl font-semibold mb-4 text-center">
                    Leaderboard
                </h2>

                {error && (
                    <p className="text-red-400 text-center">{error}</p>
                )}

                {!leaderboard && !error && (
                    <p className="text-center text-neutral-400">Loading...</p>
                )}

                {leaderboard && (
                    
                    <div className="space-y-2 w-50 min-h-50">
                        <div className="flex justify-between">
                        {lengths.map((len) => (
                            <p key={`leaderboard-${len}`} className={`${len === selected ? 'underline' : ''} cursor-pointer`} onClick={() => setSelected(len)}>{len}</p>
                        ))}
                        </div>
                        {leaderboard.map((entry, index) => (
                            <div
                                key={entry.user_id}
                                className={`flex justify-between items-center px-4 rounded-md ${index === 0 ? 'text-yellow-400 font-bold' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : ''}`}
                            >
                                <span>{entry.user.name}: {entry.score}  <span className="font-bold text-gray-400 text-xs">(WPM)</span></span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}