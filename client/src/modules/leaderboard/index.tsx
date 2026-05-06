import { useState } from "react"
import { lengths } from "../typing/components/constants"
import { useLeaderboard } from "./hooks/useLeaderboard"


export function Leaderboard({length}: {length?: number}) {
    const [selected, setSelected] = useState(length ?? 10)
    const { leaderboard, error } = useLeaderboard({selected})

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
                                className={`flex justify-between items-center px-4 rounded-md ${index === 0 ? 'text-yellow-400 font-bold' : index === 1 ? 'text-blue-300' : index === 2 ? 'text-orange-400' : ''}`}
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