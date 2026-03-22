import { useEffect, useState } from "react"

export function useJuice() {
    const JUICE_STORAGE_KEY = 'typing-juice'

    const [juice, setJuice] = useState<boolean>(() => {
        const juice = localStorage.getItem(JUICE_STORAGE_KEY)
        return juice ? JSON.parse(juice) : true
    })

    
    useEffect(() => {
       localStorage.setItem(JUICE_STORAGE_KEY, JSON.stringify(juice)) 
    }, [juice])

    
    return [juice, setJuice] as const
}