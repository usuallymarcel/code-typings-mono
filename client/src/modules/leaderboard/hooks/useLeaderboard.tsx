import { useCallback, useEffect, useState } from "react"
import type { User } from "../../../utils/User/UserContext"

type LeaderboardEntry = {
    user_id: number
    score: number
    category: string
    user: User
}

type res = {
    ok: boolean
    leaderboard: LeaderboardEntry[]
}

export function useLeaderboard({ selected }: { selected: number }) {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>()
    const [error, setError] = useState<string | null>()
    
    const fetchLeaderboard = useCallback(async () => {
        try {
            setError(null)
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
    }, [selected])

    useEffect(() => {
        fetchLeaderboard()
    }, [fetchLeaderboard, selected])

    return { fetchLeaderboard, leaderboard, error }
}