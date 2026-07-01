import { RARITY_COLOR } from './rarity'
import type { Rarity } from '../models/pet'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { usePetSpeciesContext } from '../contexts/PetSpeciesContext'
import { useEffect, useState } from 'react'

export function PetInventory() {
    const { inventory, setActive, loading, refetch: refetchInventory, setNickname, groups } = usePetInventoryContext()
    const { species } = usePetSpeciesContext()
    const meta = (id: string) => species.find(s => s.speciesId === id)

    const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map(g => [g, false])))

    const [nicknames, setNicknames] = useState<Record<string, string>>({})
    
    useEffect(() => {
        refetchInventory()
    }, [refetchInventory])

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
                    <p className="cursor-pointer" onClick={() => {setOpen(prev => ({...prev, [g]: !prev[g]}))}}>{g} {open[g] === true ? '⌄' : '>'}</p>
                    {open[g] === true && inventory.filter(i => i.source === g).map(p => {const rarity: Rarity = meta(p.speciesId)?.rarity ?? 'common'
                return (
                    <div key={p.instanceId} className="flex items-center justify-between px-3 py-2">
                        <div className='flex flex-col'>
                            {
                            !p.nickname 
                            ? 
                            <div className='flex flex-row gap-1'>
                                <input 
                                type="text" 
                                className='font-light text-xs border rounded-md px-1 max-w-25' 
                                value={nicknames[p.instanceId] ?? p.nickname ?? 'unnamed'} 
                                maxLength={20}
                                onChange={(e) => 
                                    setNicknames(prev => ({
                                        ...prev,
                                        [p.instanceId]: e.target.value
                                    }))
                                }
                                 />
                                <button 
                                className='border rounded-md px-2 text-xs bg-(--button-bg) text-(--button-text)' 
                                onClick={() => {
                                    if (window.confirm('This can only be done once')) setNickname(p.instanceId, nicknames[p.instanceId] ?? p.nickname ?? '')}}
                                >Set</button>
                            </div> 
                            : 
                            <p className='text-xs font-medium italic'>{p.nickname}</p>
                            }
                        <span className="font-medium text-sm" style={{ color: RARITY_COLOR[rarity] }}>
                            {meta(p.speciesId)?.displayName ?? p.speciesId}
                        </span>
                        </div>
                        <button
                            onClick={() => setActive(p.instanceId, !p.active)}
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
        </div>
    )
}
