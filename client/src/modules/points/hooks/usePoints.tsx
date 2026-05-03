import { useCallback, useEffect, useState } from "react"
import { useUser } from "../../../utils/User/UserContext"

type PointsResponse = {
    ok: boolean
    points: {
        user_id: number
        id: number
        points: number
    }
}

type TokenResponse = {
    ok: boolean
    token: string
}

export function usePoints() {
    const [points, setPoints] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const { user } = useUser()

    const fetchPoints = useCallback(async () => {
        if (!user) return

        try {
            setLoading(true)
            setError(null)

            const res = await fetch(
                `${import.meta.env.VITE_FASTAPI_API_URL}/points`,
                { credentials: "include" }
            )

            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const data: PointsResponse = await res.json()

            if (!data.ok) throw new Error("Failed to load points")

            setPoints(data.points.points)
        } catch (err) {
            setError(err instanceof Error ? err : new Error("Unknown error"))
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        fetchPoints()
    }, [fetchPoints])

    const refreshPoints = fetchPoints

    const updatePoints = useCallback(async (score: number, category: string) => {
        try {
            const tokenRes = await fetch(
                `${import.meta.env.VITE_FASTAPI_API_URL}/leaderboard/token`,
                { credentials: "include" }
            )

            const tokenData: TokenResponse = await tokenRes.json()

            if (!tokenData.ok || !tokenData.token) return

            await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/points`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    score,
                    category,
                    token: tokenData.token,
                }),
            })

            await fetchPoints()
        } catch (err) {
            console.error(err)
        }
    }, [fetchPoints])

    return {
        points,
        loading,
        error,
        fetchPoints: refreshPoints,
        updatePoints,
        setPoints,
    }
}