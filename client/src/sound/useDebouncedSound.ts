import { useRef } from 'react'
import type { SoundEvent } from './soundEvent';
import { useSound } from './useSound';


export function useDebouncedSound(event: SoundEvent, delay = 30) {
    const { playSound } = useSound()
    const lastTime = useRef(0)

    return () => {
        const now = performance.now()
        if (now - lastTime.current > delay) {
            playSound(event)
            lastTime.current = now
        }
    }
}