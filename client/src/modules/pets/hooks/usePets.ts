import { useCallback, useState } from 'react'
import { usePetEngine } from '../hooks/usePetEngine'
import type { RunTimePet } from '../models/pet'

export function usePets() {
    const engine = usePetEngine()
    const [, setTick] = useState(0)


    const syncPets = useCallback((targets: RunTimePet[]) => {
        engine.syncPets(targets)
        setTick(prev => prev + 1)
    }, [engine])

    return { syncPets, pets: engine.pets}
}