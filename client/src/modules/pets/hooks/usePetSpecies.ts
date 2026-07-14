import { useCallback, useEffect, useState } from "react";
import type { SpeciesEntry } from "../models/pet";
import { serverUrl } from "../../../utils/env";

export function usePetSpecies() {
    const [species, setSpecies] = useState<SpeciesEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const fetchSpecies = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const res = await fetch(`${serverUrl}/pets/species`, { credentials: 'include' })

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`)
            }

            const data = await res.json()

            if (!data.ok) {
                throw new Error(`Failed to load species`)
            }

            const species = data.species as SpeciesEntry[]

            setSpecies(species)
        } catch (error) {
            setError(error instanceof Error ? error : new Error('Unknown error') )
        } finally {
            setLoading(false)
        }
    }, [])

    const meta = useCallback((id: string) => species.find(s => s.speciesId === id), [species])

    useEffect(() => {
        fetchSpecies()
        window.addEventListener('focus', fetchSpecies)
        return () => window.removeEventListener('focus', fetchSpecies)
    }, [fetchSpecies])

    return {
        species, loading, error, refetch: fetchSpecies, meta
    }
}