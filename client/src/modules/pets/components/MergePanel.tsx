// client/src/modules/pets/components/MergePanel.tsx
import { useEffect, useMemo, useState } from 'react'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { useBattleContext } from '../contexts/BattleContext'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { PetInstance, SpeciesEntry } from '../models/pet'

function levelFor(xp: number) {
    return xp < 2 ? 1 : xp < 5 ? 2 : 3
}

export function MergePanel() {
    const { inventory, refetch } = usePetInventoryContext()
    const { merge } = useBattleContext()
    const { species } = usePetSpecies()

    const meta = useMemo(() => {
        const map = new Map<string, SpeciesEntry>()
        for (const s of species) map.set(s.speciesId, s)
        return map
    }, [species])

    // Group owned instances by species so duplicates are obvious.
    const groups = useMemo(() => {
        const map = new Map<string, PetInstance[]>()
        for (const p of inventory) {
            const arr = map.get(p.speciesId) ?? []
            arr.push(p)
            map.set(p.speciesId, arr)
        }
        // Only species the user has 2+ of can be merged.
        return [...map.entries()].filter(([, arr]) => arr.length >= 2)
    }, [inventory])

    const [baseId, setBaseId] = useState<string | null>(null)
    const [sacrificeId, setSacrificeId] = useState<string | null>(null)
    const [feeding, setFeeding] = useState(false)
    const [flash, setFlash] = useState(false)
    const [errMsg, setErrMsg] = useState<string | null>(null)

    const base = inventory.find(p => p.instanceId === baseId) ?? null
    const sacrifice = inventory.find(p => p.instanceId === sacrificeId) ?? null
    const baseSpecies = base ? meta.get(base.speciesId) : undefined

    // Clear a stale selection if the underlying pet vanished (e.g. post-merge).
    useEffect(() => {
        if (baseId && !inventory.some(p => p.instanceId === baseId)) setBaseId(null)
        if (sacrificeId && !inventory.some(p => p.instanceId === sacrificeId)) setSacrificeId(null)
    }, [inventory, baseId, sacrificeId])

    const baseMaxed = base ? base.xp >= 5 : false

    // Preview: target gains exactly +1 xp (capped at 5).
    const previewXp = base ? Math.min(5, base.xp + 1) : 0
    const previewAttack = baseSpecies ? baseSpecies.baseAttack + previewXp : 0
    const previewHealth = baseSpecies ? baseSpecies.baseHealth + previewXp : 0

    const canFeed =
        !!base && !!sacrifice &&
        base.instanceId !== sacrifice.instanceId &&
        base.speciesId === sacrifice.speciesId &&
        !baseMaxed

    const feed = async () => {
        if (!canFeed || !base || !sacrifice) return
        try {
            setFeeding(true)
            setErrMsg(null)
            await merge(base.instanceId, sacrifice.instanceId)
            setFlash(true)
            setSacrificeId(null)
            await refetch()
            setTimeout(() => setFlash(false), 700)
        } catch (err) {
            setErrMsg((err as Error).message)
        } finally {
            setFeeding(false)
        }
    }

    return (
        <div className="flex flex-col gap-4 p-4 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-semibold text-center">Merge pets</h2>
            <p className="text-xs opacity-60 text-center">
                Feed a duplicate into a base of the same species. 3 copies → level 2, 6 copies → level 3.
            </p>

            {groups.length === 0 && (
                <p className="opacity-60 text-sm text-center py-4">
                    You need two of the same species to merge.
                </p>
            )}

            <div className="max-h-72 overflow-auto flex flex-col gap-3">
                {groups.map(([speciesId, dupes]) => {
                    const s = meta.get(speciesId)
                    const rarity = s?.rarity ?? 'common'
                    return (
                        <div key={speciesId} className="border rounded-lg p-2" style={{ borderColor: RARITY_COLOR[rarity] }}>
                            <div className="flex items-center gap-2 mb-2">
                                <div style={spriteThumbStyle(spriteThumbUrl(s), 32)} />
                                <span className="font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                                    {s?.displayName ?? speciesId}
                                </span>
                                <span className="text-xs opacity-50">×{dupes.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {dupes.map(p => {
                                    const isBase = p.instanceId === baseId
                                    const isSac = p.instanceId === sacrificeId
                                    const maxed = p.xp >= 5
                                    return (
                                        <div key={p.instanceId} className="flex flex-col items-center">
                                            <span
                                                className={`text-[10px] px-2 py-0.5 rounded ${
                                                    isBase ? 'bg-amber-500/30' : isSac ? 'bg-red-500/30' : 'bg-white/5'
                                                }`}
                                            >
                                                L{levelFor(p.xp)} · xp {p.xp}
                                            </span>
                                            <div className="flex gap-1 mt-1">
                                                <button
                                                    onClick={() => setBaseId(p.instanceId)}
                                                    disabled={maxed}
                                                    title={maxed ? 'Already max level' : 'Use as base'}
                                                    className={`text-[10px] px-1 rounded border disabled:opacity-30 ${
                                                        isBase ? 'bg-amber-600 text-black' : ''
                                                    }`}
                                                >base</button>
                                                <button
                                                    onClick={() => setSacrificeId(p.instanceId)}
                                                    className={`text-[10px] px-1 rounded border ${
                                                        isSac ? 'bg-red-600 text-black' : ''
                                                    }`}
                                                >feed</button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* preview + feed action */}
            {base && (
                <div
                    className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"
                    style={{
                        boxShadow: flash ? `0 0 28px ${RARITY_COLOR[baseSpecies?.rarity ?? 'common']}` : undefined,
                        transition: 'box-shadow .25s',
                    }}
                >
                    <div className="flex items-center gap-2">
                        <div
                            style={spriteThumbStyle(spriteThumbUrl(baseSpecies), 40)}
                            className={flash ? 'animate-pulse' : ''}
                        />
                        <div className="text-xs">
                            <div className="opacity-70">{baseSpecies?.displayName}</div>
                            {baseMaxed ? (
                                <div className="text-amber-300">Max level (L3)</div>
                            ) : (
                                <div>
                                    L{levelFor(base.xp)} → <span className="text-amber-300">L{levelFor(previewXp)}</span>
                                    {'  '}⚔ {baseSpecies ? baseSpecies.baseAttack + base.xp : 0}→{previewAttack}
                                    {'  '}❤ {baseSpecies ? baseSpecies.baseHealth + base.xp : 0}→{previewHealth}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {errMsg && <span className="text-xs text-red-400">{errMsg}</span>}
                        <button
                            onClick={feed}
                            disabled={!canFeed || feeding}
                            className="rounded-xl px-4 py-1 text-black bg-green-600 hover:bg-green-800 disabled:opacity-50"
                        >
                            {feeding ? '...' : 'Feed'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
