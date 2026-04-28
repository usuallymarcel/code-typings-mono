import { useCallback, useEffect, useState } from "react"
import { useUser } from "../../../utils/User/UserContext"

type PointsResponse = {ok: boolean, points: { user_id: number, id: number, points: number}}

type res = {
    ok: string
    token: string
}

export function usePoints() {
    const [points, setPoints] = useState<number | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const {user} = useUser()
    

    
    const fetchPoints = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            
            const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/points`, {
                credentials: 'include'
            })
            
            if (!res.ok) {
                throw new Error(`error: ${res.status}`)
            }
            
            const data: PointsResponse = await res.json()
            
            if (!data.ok) {
                throw new Error('Failed to get points')
            }
            setPoints(data.points.points)
            
        } catch (error) {
            if (error instanceof Error)  {
                setError(error)
            }
            console.error(error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (user) {
            fetchPoints()
        }
    }, [user, fetchPoints])
    

    const updatePoints = async (score: number, category: string) => {
        try {
            const res = await fetch (`${import.meta.env.VITE_FASTAPI_API_URL}/leaderboard/token`, {
                credentials: "include"
            })
    
            const data = await res.json() as res
    
            if (!data.ok || !data.token) {
                console.error('failed to get leaderboard token')
                return
            }
    
            await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/points`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 'score': score, 'category': category, 'token': data.token})
            })
        } catch (error) {
            console.error(error)
        }
    }

    const flipCoin = async (heads: boolean) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/points/flip_coin`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 'heads': heads})
            })

            if (!res.ok) {
                throw new Error('Failed to clip a coin')
            }

            const data = await res.json() as {ok: boolean, win: boolean, points: number}

            if (!data.ok) {
                console.error('failed to get flip a coin')
                return
            }

            setPoints(data.points)

            return data.win
        } catch (error) {
            console.error(error)
        }
    }
    
    useEffect(() => {
        fetchPoints()
    }, [fetchPoints])

    return {fetchPoints, updatePoints, flipCoin, points, loading, error}
}