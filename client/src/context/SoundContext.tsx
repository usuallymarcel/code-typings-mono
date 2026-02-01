import { createContext, useRef, useState } from 'react'
import type { SoundEvent } from '../types/soundEvent'

export type SoundMap = Record<SoundEvent, string | null>

type SoundContextValue = {
    sounds: SoundMap
    playSound: (event: SoundEvent, volume?: number) => void
    setSound: (event: SoundEvent, src: string | null) => void
    muted: boolean
    toggleMute: () => void
}

const defaultSounds: SoundMap = {
    type: "/sounds/type1.wav",
    error: "/sounds/Locked.wav",
    ding: "sounds/Confirm 2.wav",
    pop: "/sounds/pop34.wav",
    jump: "/sounds/jump25.wav",
    paper: "/sounds/paper43.wav",
    oops: "/sounds/shone54.wav"
}

export const SoundContext = createContext<SoundContextValue | null>(null)

export const SoundProvider = ({ children }: { children: React.ReactNode }) => {
    const [sounds, setSounds] = useState<SoundMap>(defaultSounds)
    const [muted, setMuted] = useState(false)
    const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map())

    const playSound = (event: SoundEvent, volume: number = 1) => {
        if (muted) return

        const src = sounds[event]

        if (!src) return

        let audio = audioCache.current.get(src)

        if (!audio) {
            audio = new Audio(src)
            audioCache.current.set(src, audio)
        }

        const clone = audio.cloneNode() as HTMLAudioElement
        clone.volume = volume
        clone.playbackRate = 0.95 + Math.random() * 0.1
        clone.play()
    }

    const setSound = (event: SoundEvent, src: string | null) => {
        setSounds(prev => ({...prev, [event]: src }))
    }

    const toggleMute = () => { setMuted(prev => !prev)}

    return (
        <SoundContext.Provider value={{ sounds, playSound, setSound, muted, toggleMute}}>
            {children}
        </SoundContext.Provider>
    )
}