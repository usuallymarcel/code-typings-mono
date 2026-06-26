// client/src/modules/pets/components/TeamBuilder.tsx
import { useMemo, useState } from 'react'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { useBattleContext } from '../contexts/BattleContext'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { SpeciesEntry } from '../models/pet'

const MAX_TEAM = 5

// Authoritative stat formulas — identical to the server.
function statsFor(xp: number, species?: SpeciesEntry) {
    const base = species ? { atk: species.baseAttack, hp: species.baseHealth } : { atk: 0, hp: 0 }
    const level = xp < 2 ? 1 : xp < 5 ? 2 : 3
    return { attack: base.atk + xp, health: base.hp + xp, level }
}

export function TeamBuilder() {
    const { inventory } = usePetInventoryContext()
    const { team, saveTeam } = useBattleContext()
    const { species } = usePetSpecies()

    const meta = useMemo(() => {
        const map = new Map<string, SpeciesEntry>()
        for (const s of species) map.set(s.speciesId, s)
        return map
    }, [species])

    // Seed the editor from the saved team (front-to-back order preserved).
    const [order, setOrder] = useState<string[]>(() => team.map(t => t.instanceId))
    const [saving, setSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState<string | null>(null)

    const byId = useMemo(() => {
        const map = new Map<string, (typeof inventory)[number]>()
        for (const p of inventory) map.set(p.instanceId, p)
        return map
    }, [inventory])

    const inTeam = (id: string) => order.includes(id)

    const add = (id: string) => {
        if (inTeam(id) || order.length >= MAX_TEAM) return
        setOrder(prev => [...prev, id])
        setSavedMsg(null)
    }
    const remove = (id: string) => {
        setOrder(prev => prev.filter(x => x !== id))
        setSavedMsg(null)
    }
    const move = (index: number, dir: -1 | 1) => {
        const j = index + dir
        if (j < 0 || j >= order.length) return
        setOrder(prev => {
            const next = [...prev]
            const tmp = next[index]
            next[index] = next[j]
            next[j] = tmp
            return next
        })
        setSavedMsg(null)
    }

    const save = async () => {
        try {
            setSaving(true)
            setSavedMsg(null)
            await saveTeam(order)
            setSavedMsg('Team saved')
        } catch (err) {
            setSavedMsg((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const bench = inventory.filter(p => !inTeam(p.instanceId))

    return (
        <div className="flex flex-col gap-4 p-4 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-semibold text-center">Your team</h2>

            {/* current ordered team — index 0 is FRONT */}
            <div className="flex flex-col gap-2">
                {order.length === 0 && (
                    <p className="opacity-60 text-sm text-center py-2">
                        Add up to {MAX_TEAM} pets below. The top pet fights first.
                    </p>
                )}
                {order.map((id, index) => {
                    const inst = byId.get(id)
                    const s = inst && meta.get(inst.speciesId)
                    const stats = statsFor(inst?.xp ?? 0, s)
                    const rarity = s?.rarity ?? 'common'
                    return (
                        <div
                            key={id}
                            className="flex items-center gap-3 rounded-lg border px-2 py-1"
                            style={{ borderColor: RARITY_COLOR[rarity] }}
                        >
                            <span className="w-12 text-[10px] uppercase tracking-wide opacity-60">
                                {index === 0 ? 'front' : `#${index + 1}`}
                            </span>
                            <div style={spriteThumbStyle(spriteThumbUrl(s), 40)} />
                            <span className="flex-1 font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                                {inst?.nickname ?? s?.displayName ?? id}
                            </span>
                            <StatChips attack={stats.attack} health={stats.health} level={stats.level} />
                            <div className="flex flex-col">
                                <button
                                    onClick={() => move(index, -1)}
                                    disabled={index === 0}
                                    className="text-xs px-1 disabled:opacity-30"
                                >▲</button>
                                <button
                                    onClick={() => move(index, 1)}
                                    disabled={index === order.length - 1}
                                    className="text-xs px-1 disabled:opacity-30"
                                >▼</button>
                            </div>
                            <button
                                onClick={() => remove(id)}
                                className="text-red-400 hover:text-red-300 px-1"
                            >✕</button>
                        </div>
                    )
                })}
            </div>

            <div className="flex items-center justify-between">
                <span className="text-xs opacity-60">{order.length}/{MAX_TEAM} selected</span>
                <div className="flex items-center gap-2">
                    {savedMsg && <span className="text-xs opacity-70">{savedMsg}</span>}
                    <button
                        onClick={save}
                        disabled={saving}
                        className="rounded-xl px-4 py-1 text-black bg-green-600 hover:bg-green-800 disabled:opacity-50"
                    >
                        {saving ? '...' : 'Save team'}
                    </button>
                </div>
            </div>

            {/* bench: owned pets not in the team */}
            <div className="border-t border-white/10 pt-3">
                <h3 className="text-sm opacity-70 mb-2">Available pets</h3>
                <div className="max-h-72 overflow-auto flex flex-col gap-1">
                    {bench.length === 0 && (
                        <p className="opacity-60 text-sm">No spare pets — open a lootbox!</p>
                    )}
                    {bench.map(p => {
                        const s = meta.get(p.speciesId)
                        const stats = statsFor(p.xp, s)
                        const rarity = s?.rarity ?? 'common'
                        const full = order.length >= MAX_TEAM
                        return (
                            <button
                                key={p.instanceId}
                                onClick={() => add(p.instanceId)}
                                disabled={full}
                                className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-white/5 disabled:opacity-40 text-left"
                            >
                                <div style={spriteThumbStyle(spriteThumbUrl(s), 40)} />
                                <span className="flex-1 font-medium" style={{ color: RARITY_COLOR[rarity] }}>
                                    {p.nickname ?? s?.displayName ?? p.speciesId}
                                </span>
                                <StatChips attack={stats.attack} health={stats.health} level={stats.level} />
                                <span className="text-xs opacity-50">{full ? '' : '+ add'}</span>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// shared stat-chips (also reused on PetInventory rows — see 6.7)
export function StatChips({
    attack, health, level,
}: { attack: number; health: number; level: number }) {
    return (
        <div className="flex gap-1 text-[10px] font-mono">
            <span className="px-1 rounded bg-red-500/20 text-red-300">⚔ {attack}</span>
            <span className="px-1 rounded bg-emerald-500/20 text-emerald-300">❤ {health}</span>
            <span className="px-1 rounded bg-amber-500/20 text-amber-300">L{level}</span>
        </div>
    )
}
