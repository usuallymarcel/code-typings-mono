type res = {
    ok: string
    token: string
}

export function useLeaderboardEntry() {
    const sendLeaderboardEntry = async (score: number, category: string) => {
        try {
            const res = await fetch (`${import.meta.env.VITE_FASTAPI_API_URL}/leaderboard/token`, {
                credentials: "include"
            })
    
            const data = await res.json() as res
    
            if (!data.ok || !data.token) {
                console.error('failed to get leaderboard token')
                return
            }
    
            await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/leaderboard`, {
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

    return { sendLeaderboardEntry }
}