import { useEffect, useState } from "react";
import type { PetInstance, SpeciesEntry } from "../models/pet";
import { usePetInventoryContext } from "../contexts/PetInventoryContext";
import { RARITY_COLOR } from "./rarity";
import { serverUrl } from "../../../utils/env";

export function InspectPetModal({isOpen, onClose, pet}: {isOpen: boolean, onClose: () => void, pet: SpeciesEntry & PetInstance | undefined}) {
    const { setNickname } = usePetInventoryContext()
    const [hideInput, setHideInput] = useState(false)

    const [name, setName] = useState<string>("")

    const [frame, setFrame] = useState(0)

    const behaviors = pet?.behaviorBag ? [...new Set(pet.behaviorBag)] : ['']
    
    const [sprite, setSprite] = useState('idle')
    
    const animation = pet?.animations[sprite]
    
    useEffect(() => {
        if (!isOpen || !animation) return

        const id = setInterval(() => {
            setFrame(f => (f + 1) % animation.frames)
        }, (1000 / animation.fps))

        return () => clearInterval(id)
    }, [isOpen, sprite, pet, animation?.fps, animation?.frames, animation])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(pet?.nickname ?? 'unnamed')
        setHideInput(false)
        setSprite('idle')
        setFrame(0)
    }, [pet])

    if (!isOpen) return null
    if (!pet) return null
    
    return (
        <div className="fixed inset-0 flex items-center justify-center"
            onClick={onClose}>
                <div
                    className="[background:var(--bg)] border rounded-xl p-6 w-105"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="grid grid-cols-2">
                    <div>
                        <h2 className="text-2xl font-bold" style={{ color: RARITY_COLOR[pet.rarity] }}>{pet.displayName}</h2>
                        <p className="text-sm capitalize opacity-70">{pet.rarity}</p>
                        <h3 className="font-semibold mt-3" style={{ color: RARITY_COLOR[pet.rarity] }}>Nickname</h3>
                    </div>
                    <div>
                        
                    <div 
                        className="mt-auto mb-auto mr-auto ml-auto"
                        style={{
                            backgroundPosition: `-${frame * pet.animations[sprite].frameWidth}px 0px`, 
                            backgroundImage: `url(${serverUrl}${pet.spriteSheets[sprite]})`,
                            width: pet.width,
                            height: pet.height,
                            imageRendering: 'pixelated',
                            backgroundRepeat: 'no-repeat',
                            willChange: 'transform'
                        }}             
                    ></div>
                        <div className="flex justify-around text-sm opacity-70">
                            <p>Frames: {animation?.frames}</p>
                            <p>FPS: {animation?.fps}</p>
                        </div> 
                        </div>
                </div>

                    {/* Nickname */}
                    <div className="space-y-2 mt-2">

                        {!pet.nickname && !hideInput ? (
                            <>
                                <input
                                    type="text"
                                    value={name}
                                    maxLength={20}
                                    onChange={(e) => setName(e.target.value)}
                                    className="border rounded px-2 py-1 w-full"
                                />

                                <button
                                    className="border rounded px-3 py-1 text-(--button-text) bg-(--button-bg)"
                                    disabled={!name.trim()}
                                    onClick={() => {
                                        if (window.confirm("This can only be done once")) {
                                            setNickname(pet.instanceId, name)
                                            setHideInput(true)
                                        }
                                    }}
                                >
                                    Set
                                </button>
                            </>
                        ) : (
                            <p>{pet.nickname ?? name}</p>
                        )}
                    </div>

                    {/* Stats */}
                    <div>
                        <h3 className="font-semibold mb-2 mt-5" style={{ color: RARITY_COLOR[pet.rarity] }}>Stats</h3>

                        <div className="grid grid-cols-3 gap-3 text-sm">
                            <div>
                                <div className="opacity-70">Attack</div>
                                <div>{pet.baseAttack}</div>
                            </div>

                            <div>
                                <div className="opacity-70">Health</div>
                                <div>{pet.baseHealth}</div>
                            </div>

                            <div>
                                <div className="opacity-70">Speed</div>
                                <div>{pet.defaultSpeed}</div>
                            </div>
                        </div>
                    </div>

                    {/* Ability */}
                    <div>
                        <h3 className="font-semibold mb-2 mt-5" style={{ color: RARITY_COLOR[pet.rarity] }}>Ability</h3>

                        {pet.special ? (
                            <>
                                <p className="font-medium">
                                    {pet.special.name} (Tier {pet.special.tier})
                                </p>

                                <p className="text-sm opacity-80">
                                    {pet.special.description}
                                </p>

                                <p className="text-sm mt-1">
                                    Magnitude: {pet.special.magnitude}
                                </p>
                            </>
                        ) : (
                            <p className="opacity-60 italic">
                                No special ability.
                            </p>
                        )}
                    </div>

                    {/* Behaviors */}
                    <div>
                        <h3 className="font-semibold mb-2 mt-5" style={{ color: RARITY_COLOR[pet.rarity] }}>Behaviors</h3>

                        <div className="flex flex-wrap gap-2">
                            {behaviors.map((behavior, i) => (
                                <span
                                    key={`${behavior}-${i}`}
                                    onClick={() => setSprite(behavior)}
                                    className={`border rounded-full px-2 py-1 text-xs capitalize cursor-pointer ${behavior === sprite ? 'bg-(--button-bg) text-(--button-text)' : ''}`}
                                >
                                    {behavior}
                                </span>
                            ))}
                        </div>

                    </div>

                    {/* Misc */}
                    <div className="text-sm opacity-70 mt-5">
                        Obtained: {new Date(pet.unlockedAt).toLocaleDateString()}
                    </div>

                    <div className="flex justify-end mt-5">
                        <button
                            className="border rounded-xl px-4 py-1 text-(--button-text) bg-(--button-bg)"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>
        </div>
    )
}