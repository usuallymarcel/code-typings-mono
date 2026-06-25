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
            }}
        >
            <span
                className="absolute text-[10px] whitespace-nowrap"
                style={{
                    left: '50%',
                    top: '100%',
                    transform: 'translateX(-50%)',
                }}
            >
                {pet.nickname}
            </span>

            <div
                style={{
                    width: pet.species.width,
                    height: pet.species.height,
                    imageRendering: 'pixelated',
                    backgroundRepeat: 'no-repeat',
                    willChange: 'transform',
                }}
            />
        </div>
    )
}