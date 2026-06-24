import { createContext, useContext } from "react"
import { usePoints } from "../hooks/usePoints"

const PointsContext = createContext<ReturnType<typeof usePoints> | null>(null)

export function PointsProvider({ children }: { children: React.ReactNode }) {
    const points = usePoints()
    return (
        <PointsContext.Provider value={points}>
            {children}
        </PointsContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePointsContext() {
    const ctx = useContext(PointsContext)
    if (!ctx) throw new Error("usePoints must be used within PointsProvider")
    return ctx
}