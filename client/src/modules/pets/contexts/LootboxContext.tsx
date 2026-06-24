import { createContext, useContext, type ReactNode } from "react"
import type { LootboxOpenResult, LootboxSummary } from "../models/pet"
import { useLootboxes } from "../hooks/useLootboxes"

type LootboxContextType = {
    boxes: LootboxSummary[]
    open: (sku: string) => Promise<LootboxOpenResult>
    opening: boolean,
    refetch: () => Promise<void>
}

const LootboxContext = createContext<LootboxContextType | null>(null)

export function LootboxProvider({children}:{children: ReactNode}) {
    const lootboxes = useLootboxes()

    return (
        <LootboxContext.Provider value={lootboxes}>
            {children}
        </LootboxContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLootboxContext() {
    const context = useContext(LootboxContext)

    if (!context) {
        throw new Error(
            'useLootboxContext must be used inside a PetInventoryProvider'
        )
    }

    return context
}