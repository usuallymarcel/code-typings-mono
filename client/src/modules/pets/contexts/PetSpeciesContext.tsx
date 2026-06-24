import { createContext, useContext, type ReactNode } from "react"
import type { SpeciesEntry } from "../models/pet"
import { usePetSpecies } from "../hooks/usePetSpecies"

type PetSpeciesContextType = {
    species: SpeciesEntry[]
    loading: boolean
    error: Error | null
    refetch: () => Promise<void>
}

const PetSpeciesContext = createContext<PetSpeciesContextType | null>(null)

export function PetSpeciesProvider({ children }: { children: ReactNode }) {
    const species = usePetSpecies()

    return (
        <PetSpeciesContext.Provider value={species}>
            {children}
        </PetSpeciesContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePetSpeciesContext() {
    const context = useContext(PetSpeciesContext)

    if (!context) {
        throw new Error('usePetSpeciesContext must be used inside a PetSpeciesProvider')
    }

    return context
}
