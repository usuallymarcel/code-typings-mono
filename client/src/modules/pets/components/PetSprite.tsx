import type { RunTimePet } from '../models/pet'
import { useEffect, useRef } from 'react'
import { usePetEngine } from '../hooks/usePetEngine'

export function PetSprite({ pet }: { pet: RunTimePet }) {
    const ref = useRef<HTMLDivElement>(null)
    const engine = usePetEngine()


    useEffect(() => {
        if (ref.current) {
            engine.setPetElement(pet, ref.current)
        }
    }, [pet, engine])

    return (
        <div
            ref={ref}
            className="absolute select-none pointer-events-auto"
            style={{
                width: pet.species.width,
                height: pet.species.height,
                imageRendering: 'pixelated',
                backgroundRepeat: 'no-repeat',
                willChange: 'transform',
            }}
        />
    )
}