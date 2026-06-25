import {
    createContext,
    useContext,
    type ReactNode,
} from 'react'

import { usePetInventory } from '../hooks/usePetInventory'

type PetInventoryContextType = ReturnType<typeof usePetInventory>

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

// eslint-disable-next-line react-refresh/only-export-components
export function usePetInventoryContext() {
    const context = useContext(PetInventoryContext)

    if (!context) {
        throw new Error(
            'usePetInventoryContext must be used inside a PetInventoryProvider'
        )
    }

    return context
}