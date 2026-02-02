import { createContext, useEffect, useRef, useState } from 'react'
import type { SoundEvent } from './soundEvent'

export type SoundMap = Record<SoundEvent, string | null>

type SoundContextValue = {
    sounds: SoundState
    playSound: (event: SoundEvent) => void
    setSoundSrc: (event: SoundEvent, src: string | null) => void
    setVolume: (event: SoundEvent, volume: number ) => void
    muted: boolean
    toggleMute: () => void
}

const STORAGE_KEY = 'typing-sounds'

type SoundConfig = {
    src: string | null
    volume: number
}

type SoundState = Record<SoundEvent, SoundConfig>

const defaultState: SoundState = {
    type: { src: "/sounds/type1.wav", volume: 0.8 },
    error: { src: "/sounds/Locked.wav", volume: 0.4 },
    oops: { src: "/sounds/shone54.wav", volume: 0.2 },
    pop: { src: "/sounds/pop34.wav", volume: 0.6 },
    paper: { src: "/sounds/paper43.wav", volume: 0.6 },
    ding: { src: "/sounds/Confirm 2.wav", volume: 0.4 },
    jump: { src: "/sounds/jump25.wav", volume: 0.4 },
}

export const SoundContext = createContext<SoundContextValue | null>(null)

export const SoundProvider = ({ children }: { children: React.ReactNode }) => {
    const [sounds, setSounds] = useState<SoundState>(() => {
        const saved = localStorage.getItem(STORAGE_KEY)
        return saved ? JSON.parse(saved) : defaultState
    })
    const [muted, setMuted] = useState(false)
    const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map())

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sounds))
    }, [sounds])

    const playSound = (event: SoundEvent) => {
        if (muted) return

        const {src, volume} = sounds[event]

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

    const setSoundSrc = (event: SoundEvent, src: string | null) => {
        setSounds(prev => ({...prev, [event]: { ...prev[event], src} }))
    }

    const setVolume = (event: SoundEvent, volume: number) => {
        setSounds(prev => ({...prev, [event]: { ...prev[event], volume }}))
    }

    const toggleMute = () => { setMuted(prev => !prev)}

    return (
        <SoundContext.Provider 
            value={{ 
                sounds, 
                playSound, 
                setSoundSrc,
                setVolume, 
                muted, 
                toggleMute
                }}>
            {children}
        </SoundContext.Provider>
    )
}