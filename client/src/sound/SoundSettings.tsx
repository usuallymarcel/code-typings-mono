// SoundSettings.tsx
import { useSound } from './useSound'
import type { SoundEvent } from './soundEvent'
// import { useState } from 'react'

const events: SoundEvent[] = ['type', 'error', 'oops', 'pop', 'paper']
// const [hide, setHide] = useState<boolean>(false)


export function SoundSettings() {
    const {
        sounds, 
        setVolume,  
        muted,  
        toggleMute, 
    } = useSound()

    return (
        <div className='p-4 bg-neutral-800 rounded'>
            <h2 className='text-lg mb-2'>Sound Settings</h2>
            {/* <button onClick={() => setHide(prev => !prev)}>
                {hide ? 'Unhide' : 'Hide'}
            </button> */}

            <button onClick={toggleMute}>
                {muted ? 'Unmute' : 'Mute'}
            </button>

            {events.map(event => (
            <div key={event} className='mt-3'>
                <strong>{event}</strong>

                <input
                type='range'
                min={0}
                max={1}
                step={0.05}
                value={sounds[event].volume}
                onChange={e => setVolume(event, Number(e.target.value))}
                />
            </div>
            ))}
        </div>
    )
}
