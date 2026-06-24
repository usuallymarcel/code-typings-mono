import { useModal } from '../../../components/modal/ModalContext'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { LootboxRevealModal } from './LootboxRevealModal'
import { RARITY_COLOR } from './rarity'
import type { Rarity } from '../models/pet'
import { usePetSpeciesContext } from '../contexts/PetSpeciesContext'
import { useLootboxContext } from '../contexts/LootboxContext'

export function LootboxStore({ onOpened }: { onOpened?: () => void }) {
    const { boxes, open, opening } = useLootboxContext()
    const { species } = usePetSpeciesContext()
    const { points, fetchPoints } = usePointsContext()
    const { openModal } = useModal()

    const handleOpen = async (sku: string) => {
        if (opening) return
        try {
            const result = await open(sku)
            await fetchPoints()            // points were debited server-side
            onOpened?.()                   // let parent refetch inventory/species
            openModal(<LootboxRevealModal result={result} species={species} />)
        } catch (err) {
            openModal(
                <p className="text-red-400 p-4">
                    {(err as Error).message}
                </p>,
            )
        }
    }

    return (
        <div className="flex items-center justify-center p-8 [background:var(--bg)] rounded-xl border">
            <div className="w-full max-w-md">
                <h2 className="text-xl font-semibold mb-1 text-center">Lootboxes</h2>
                <h3 className="text-center mb-4 underline font-bold">Points: {points}</h3>

                <div className="flex flex-col gap-3">
                    {boxes.map(box => {
                        const isBroke = points != null && points < Number(box.price)
                        return (
                            <div key={box.sku} className="border rounded-xl p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-semibold">{box.name}</span>
                                    <button
                                        onClick={() => handleOpen(box.sku)}
                                        disabled={isBroke || opening}
                                        className={`text-black rounded-xl px-3 py-1 transition-colors duration-100 ${
                                            isBroke ? 'bg-teal-900 cursor-default' : 'bg-green-600 hover:bg-green-800'
                                        }`}
                                    >
                                        {opening ? '...' : `Open · ${box.price}`}
                                    </button>
                                </div>
                                {/* transparency: sanitized per-rarity odds from the server */}
                                <div className="flex gap-2 text-xs">
                                    {(Object.entries(box.odds) as [Rarity, number][])
                                        .filter(([, w]) => w > 0)
                                        .map(([rarity, weight]) => (
                                            <span key={rarity} style={{ color: RARITY_COLOR[rarity] }}>
                                                {rarity} {pct(weight, box.odds)}
                                            </span>
                                        ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// weights are relative; normalize to a % for display
function pct(weight: number, odds: Record<string, number>) {
    const total = Object.values(odds).reduce((a, b) => a + b, 0)
    return total ? `${((weight / total) * 100).toFixed(1)}%` : '—'
}