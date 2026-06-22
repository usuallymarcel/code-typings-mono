import {
    createContext,
    useContext,
    type ReactNode,
} from 'react'

import { usePetInventory } from '../hooks/usePetInventory'
import type { PetInstance } from '../models/pet'

type PetInventoryContextType = {
    inventory: PetInstance[]
    loading: boolean
    setActive: (instanceId: string, active: boolean) => Promise<void>
    refetch: () => Promise<void>
}

const PetInventoryContext = createContext<PetInventoryContextType | null>(null)

export function PetInventoryProvider({
    children,
}: {
    children: ReactNode
}) {
    const petInventory = usePetInventory()

    return (
        <PetInventoryContext.Provider value={petInventory}>
            {children}
        </PetInventoryContext.Provider>
    )
}

export function usePetInventoryContext() {
    const context = useContext(PetInventoryContext)

    if (!context) {
        throw new Error(
            'usePetInventoryContext must be used inside a PetInventoryProvider'
        )
    }

    return context
}