// client/src/modules/pets/contexts/BattleContext.tsx
import { createContext, useContext, type ReactNode } from 'react'
import { useBattle } from '../hooks/useBattle'

const BattleContext = createContext<ReturnType<typeof useBattle> | null>(null)

export function BattleProvider({ children }: { children: ReactNode }) {
    const battle = useBattle()

    return (
        <BattleContext.Provider value={battle}>
            {children}
        </BattleContext.Provider>
    )
}

export function useBattleContext() {
    const ctx = useContext(BattleContext)

    if (!ctx) {
        throw new Error('useBattleContext must be used inside a BattleProvider')
    }

    return ctx
}
