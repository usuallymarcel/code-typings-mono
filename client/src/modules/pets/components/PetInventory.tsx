import { RARITY_COLOR } from './rarity'
import type { PetInstance, Rarity, SpeciesEntry } from '../models/pet'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { usePetSpeciesContext } from '../contexts/PetSpeciesContext'
import { useEffect, useState } from 'react'
import { InspectPetModal } from './InspectPet'

export function PetInventory() {
    const { inventory, setActive, loading, refetch: refetchInventory, groups } = usePetInventoryContext()
    const { refetch: speciesInventory } = usePetSpeciesContext()
    const { meta } = usePetSpeciesContext()
    const [inspectOpen, setInspectOpen] = useState(false)
    const [petInspected, setPetInspected] = useState<SpeciesEntry & PetInstance | undefined>(undefined)

    const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(g => [g, false])))

    
    useEffect(() => {
        refetchInventory()
        speciesInventory()
    }, [refetchInventory, speciesInventory])

    if (loading && inventory.length === 0) {
        return <p className="p-4 opacity-70">Loading…</p> 
    }
    if (inventory.length === 0) {
        return <p className="p-4 opacity-70">No pets yet — open a lootbox!</p>
    }

    return (
        
        <div className="flex flex-col p-4 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-semibold text-center mb-1">Your pets ({inventory.length})</h2>
            <div className="max-h-100 overflow-auto">
            {groups.map(g => {
                return <div key={g}>
                    <p 
                        className="cursor-pointer" 
                        onClick={() => {setOpen(prev => ({...prev, [g]: !prev[g]}))}}>{g} 
                        
                        {open[g] === true ? '⌄' : '>'}</p>
                        
                        {open[g] === true && 
                        inventory.filter(i => i.source === g)
                        .map(p => {

                        const speciesInfo = meta(p.speciesId)
                        const rarity: Rarity = speciesInfo?.rarity ?? 'common'

                        return (
                            <div key={p.instanceId} className="flex items-center justify-between px-3 py-2 cursor-pointer" onClick={() => {setInspectOpen(true); setPetInspected({...meta(p.speciesId)!, ...p})}}>
                                <div className='flex flex-col'>
                                    {
                                    <p className='text-xs font-medium italic'>{p.nickname == null ? '' : p.nickname}</p>
                                    }
                                <span className="font-medium text-sm" style={{ color: RARITY_COLOR[rarity] }}>
                                    {meta(p.speciesId)?.displayName ?? p.speciesId}
                                </span>
                                </div>
                                <button
                                    onClick={(e) => {setActive(p.instanceId, !p.active); e.stopPropagation()}}
                                    className={`rounded-lg px-3 py-1 text-sm text-(--button-text) ${
                                        p.active ? 'bg-(--button-bg-bg)' : 'bg-(--button-bg)'
                                    }`}
                                >
                                    {p.active ? 'On screen' : 'Summon'}
                                </button>
                            </div>
                        )})}</div>
                
            })}
            </div>
            <InspectPetModal isOpen={inspectOpen} onClose={() => {setInspectOpen(false); setPetInspected(undefined)} } pet={petInspected} />
        </div>
    )
}
