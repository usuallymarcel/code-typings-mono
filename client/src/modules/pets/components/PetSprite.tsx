import type { Pet } from '../models/pet'
import { petAssets } from '../assets/cat/metadata'
import { useEffect, useRef } from 'react'
import { usePetEngine } from '../hooks/usePetEngine'

export function PetSprite({ pet }: { pet: Pet }) {
    const ref = useRef<HTMLDivElement>(null)
    const engine = usePetEngine()


    useEffect(() => {
        if (ref.current && engine) {
            engine?.setPetElement(pet, ref.current)
        }
    }, [pet, engine])

    return (
        <div
            ref={ref}
            className="absolute select-none"
            style={{
                width: pet.width,
                height: pet.height,
                imageRendering: 'pixelated',
                backgroundImage: `url(${petAssets[pet.currentBehavior]})`,
                backgroundRepeat: 'no-repeat',
                willChange: 'transform',
            }}
        />
    )
}