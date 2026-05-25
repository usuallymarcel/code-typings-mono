import { useEffect } from "react";
import { PetSprite } from "./components/PetSprite";
import { usePets } from "./hooks/usePets";
import type { Pet } from "./models/pet";

const examplePet: Pet = {
    id: 'cat-1',

    x: 100,
    y: window.innerHeight - 120,

    vx: 1,
    vy: 0.2,

    width: 64,
    height: 64,

    direction: 1,

    currentBehavior: 'idle',
    behaviors: ['walk', 'idle', 'follow', 'sleep', 'walk', 'walk'],

    speed: 0.2,
    targetVx: 0,
    targetVy: 0
}

export function Pets() {
    const { addPet, pets } = usePets()

    useEffect(() => {
        addPet(examplePet)
    }, [])


    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
            {pets?.map(pet => (
                <PetSprite
                    key={pet.id}
                    pet={pet}
                />
            ))}
        </div>
    )
}