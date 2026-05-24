import type { Pet } from '../models/pet'
import { catAssets } from '../assets/cat/metadata'
import { useEffect, useRef } from 'react'
import { usePetEngine } from '../hooks/usePetEngine'

export function PetSprite({ pet }: { pet: Pet }) {
    const ref = useRef<HTMLDivElement>(null)
    const engine = usePetEngine()

    const sprite = catAssets[pet.animation]

    useEffect(() => {
        console.log('piss')
        console.log(pet, engine)
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
                backgroundImage: `url(${sprite})`,
                backgroundRepeat: 'no-repeat',
                willChange: 'transform',
            }}
        />
    )
}