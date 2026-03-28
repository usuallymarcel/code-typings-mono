// SoundSettings.tsx
import { useSound } from './useSound'
import type { SoundEvent } from './soundEvent'
import { GoMute, GoUnmute } from "react-icons/go";
import { OutlineButton } from '../../components/outline-button';
// import { useModal } from '../../components/modal/ModalContext';

const events: SoundEvent[] = ['type', 'error', 'oops', 'pop', 'paper']


export function SoundSettingsModal() {
    const {
        sounds, 
        setVolume,  
        muted,  
        toggleMute, 
    } = useSound()

    // const { closeModal } = useModal()

    // const [hide, setHide] = useState<boolean>(true)


    return (
        <div className='flex items-center border justify-center p-20 text-white bg-neutral-900 rounded-xl'>
            {/* <div className="flex items-center justify-between" onClick={closeModal}> */}

{/* 
                <div className="flex gap-2">
                    {hide ? <IoIosArrowForward /> : <IoIosArrowDown />}
                </div> */}
                {/* <h2 className='text-lg'>Sound Settings</h2>
            </div> */}

            
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
                    <OutlineButton onClick={toggleMute}>
                        <span className='flex justify-center py-2'>{!muted ? <GoUnmute /> : <GoMute />}</span>
                    </OutlineButton>
                </div>
            
        </div>
    )
}
