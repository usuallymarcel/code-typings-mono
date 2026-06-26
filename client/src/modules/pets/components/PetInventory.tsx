import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { StatChips } from './TeamBuilder'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { Rarity } from '../models/pet'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'

export function PetInventory() {
    const { inventory, setActive, loading } = usePetInventoryContext()
    const { species } = usePetSpecies()
    const meta = (id: string) => species.find(s => s.speciesId === id)

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
                const s = meta(p.speciesId)
                const rarity: Rarity = s?.rarity ?? 'common'
                const level = p.xp < 2 ? 1 : p.xp < 5 ? 2 : 3
                const attack = (s?.baseAttack ?? 0) + p.xp
                const health = (s?.baseHealth ?? 0) + p.xp
                return (
                    <div key={p.instanceId} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div style={spriteThumbStyle(spriteThumbUrl(s), 32)} />
                        <span className="font-medium flex-1" style={{ color: RARITY_COLOR[rarity] }}>
                            {p.nickname ?? s?.displayName ?? p.speciesId}
                        </span>
                        <StatChips attack={attack} health={health} level={level} />
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