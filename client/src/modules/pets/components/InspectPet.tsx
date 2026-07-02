import { useEffect, useState } from "react";
import type { PetInstance, SpeciesEntry } from "../models/pet";
import { usePetInventoryContext } from "../contexts/PetInventoryContext";
import { RARITY_COLOR } from "./rarity";

export function InspectPetModal({isOpen, onClose, pet}: {isOpen: boolean, onClose: () => void, pet: SpeciesEntry & PetInstance | undefined}) {
    const { setNickname } = usePetInventoryContext()
    const [hideInput, setHideInput] = useState(false)

    const [name, setName] = useState<string>("")

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setName(pet?.nickname ?? 'unnamed')
        setHideInput(false)
    }, [pet])

    if (!isOpen) return null
    if (!pet) return null

    return (
        <div className="fixed inset-0 flex items-center justify-center"
            onClick={onClose}>
                {/* <div className="[background:var(--bg)] border rounded-xl p-6 min-w-60 gap-4"
                    onClick={(e) => {e.stopPropagation()}}>
                        <p className="my-2">{pet.displayName}</p>
                        { 
                        !pet.nickname && !hideInput && 
                            <>
                            <input 
                            type="text" 
                            className='font-light text-xs border rounded-md px-1 max-w-25' 
                            value={name} 
                            maxLength={20}
                            onChange={(e) => setName(e.target.value)
                            }
                            />
                            <button 
                            className='border rounded-md px-2 text-xs bg-(--button-bg) text-(--button-text)' 
                            onClick={() => {
                                if (window.confirm('This can only be done once')) {
                                    setNickname(pet.instanceId, name ?? pet.nickname ?? '')
                                    setHideInput(true)
                                }}}
                            >Set</button>
                            </>
                        }
                        <div className="flex flex-row gap-4">
                            <button className="border rounded-xl px-2 cursor-pointer" onClick={onClose}>Close</button>
                        </div>
                </div> */}
                <div
                    className="[background:var(--bg)] border rounded-xl p-6 w-105 space-y-5"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div>
                        <h2 className="text-2xl font-bold" style={{ color: RARITY_COLOR[pet.rarity] }}>{pet.displayName}</h2>
                        <p className="text-sm capitalize opacity-70">{pet.rarity}</p>
                    </div>

                    {/* Nickname */}
                    <div className="space-y-2">
                        <h3 className="font-semibold" style={{ color: RARITY_COLOR[pet.rarity] }}>Nickname</h3>

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
                        <h3 className="font-semibold mb-2" style={{ color: RARITY_COLOR[pet.rarity] }}>Stats</h3>

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
                        <h3 className="font-semibold mb-2" style={{ color: RARITY_COLOR[pet.rarity] }}>Ability</h3>

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
                        <h3 className="font-semibold mb-2" style={{ color: RARITY_COLOR[pet.rarity] }}>Behaviors</h3>

                        <div className="flex flex-wrap gap-2">
                            {pet.behaviorBag.map((behavior, i) => (
                                <span
                                    key={`${behavior}-${i}`}
                                    className="border rounded-full px-2 py-1 text-xs capitalize"
                                >
                                    {behavior}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Misc */}
                    <div className="text-sm opacity-70">
                        Obtained: {new Date(pet.unlockedAt).toLocaleDateString()}
                    </div>

                    <div className="flex justify-end">
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