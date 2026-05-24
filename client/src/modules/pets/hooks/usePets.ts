import { useState } from 'react'
import { usePetEngine } from '../hooks/usePetEngine'
import type { Pet } from '../models/pet'

export function usePets() {
    const engine = usePetEngine()
    const [, setTick] = useState(0)


    const addPet = (pet: Pet) => {
        if (!engine) return

        engine.addPet(pet)
        setTick(t => t + 1)
    }

    const removePet = (id: string) => {

        if (!engine) return

        engine.removePet(id)
        setTick(t => t + 1)
    }

    return { addPet, removePet, pets: engine?.pets}
}