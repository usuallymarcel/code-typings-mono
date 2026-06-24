import { RARITY_COLOR } from './rarity'
import type { Rarity } from '../models/pet'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { usePetSpeciesContext } from '../contexts/PetSpeciesContext'
import { useEffect } from 'react'

export function PetInventory() {
    const { inventory, setActive, loading, refetch } = usePetInventoryContext()
    const { species } = usePetSpeciesContext()
    const meta = (id: string) => species.find(s => s.speciesId === id)
    
    useEffect(() => {
        refetch()
    }, [refetch])

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
            {inventory.map(p => {
                const rarity: Rarity = meta(p.speciesId)?.rarity ?? 'common'
                return (
                    <div key={p.instanceId} className="flex items-center justify-between px-3 py-2">
                        <span className="font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                            {p.nickname ?? meta(p.speciesId)?.displayName ?? p.speciesId}
                        </span>
                        <button
                            onClick={() => setActive(p.instanceId, !p.active)}
                            className={`rounded-lg px-3 py-1 text-sm text-black ${
                                p.active ? 'bg-green-600 hover:bg-green-800' : 'bg-gray-400 hover:bg-gray-500'
                            }`}
                        >
                            {p.active ? 'On screen' : 'Summon'}
                        </button>
                    </div>
                )
            })}
            </div>
        </div>
    )
}