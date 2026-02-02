// SoundSettings.tsx
import { useSound } from './useSound'
import type { SoundEvent } from './soundEvent'
import { useState } from 'react'
import { IoIosArrowDown, IoIosArrowForward } from "react-icons/io";
import { GoMute, GoUnmute } from "react-icons/go";

const events: SoundEvent[] = ['type', 'error', 'oops', 'pop', 'paper']


export function SoundSettings() {
    const {
        sounds, 
        setVolume,  
        muted,  
        toggleMute, 
    } = useSound()

    const [hide, setHide] = useState<boolean>(true)


    return (
        <div className='p-4 bg-neutral-800 rounded max-w-80'>
            <div className="flex items-center justify-between" onClick={() => setHide(prev => !prev)}>


                <div className="flex gap-2">
                    {hide ? <IoIosArrowForward /> : <IoIosArrowDown />}
                </div>
                <h2 className='text-lg'>Sound Settings</h2>
            </div>

            {!hide && (
                <div className="mt-4">
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
                    <button onClick={toggleMute} className="mt-4">
                        {!muted ? <GoUnmute /> : <GoMute />}
                    </button>
                </div>
            )}
        </div>
    )
}
