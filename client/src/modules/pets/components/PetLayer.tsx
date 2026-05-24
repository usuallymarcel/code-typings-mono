import { useEffect, useState } from 'react'
import { usePetEngine } from '../hooks/usePetEngine'
import { PetSprite } from './PetSprite'
import type { Pet } from '../models/pet'

const examplePet: Pet = {
    id: 'cat-1',
    
    x: 100,
    y: window.innerHeight - 120,
    
    vx: 1,
    vy: 0,
    
    width: 64,
    height: 64,
    
    direction: 1,
    
    behavior: 'walk',
    animation: 'walk',
    
    speed: 1,
}

export function PetLayer() {
    const engine = usePetEngine()
    const [, setTick] = useState(0)

    useEffect(() => {
        if (!engine) return


        engine.addPet(examplePet)
        setTick(t => t + 1)

    }, [engine])

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
            {engine?.pets.map(pet => (
                <PetSprite
                    key={pet.id}
                    pet={pet}
                />
            ))}
        </div>
    )
}