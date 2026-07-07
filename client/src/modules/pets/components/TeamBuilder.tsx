import { useMemo, useState } from 'react'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { usePetSpeciesContext } from '../contexts/PetSpeciesContext'
import type { BattleTeam } from '../models/battle'
import { PetPortrait } from './PetPortrait'
import { RARITY_COLOR } from './rarity'

const TEAM_SIZE = 5

export function TeamBuilder({
    initial,
    saveTeam,
    busy,
    onDone,
    onCancel,
}: {
    initial?: BattleTeam
    saveTeam: (name: string, team: string[]) => Promise<void>
    busy: boolean
    onDone: () => void
    onCancel: () => void
}) {
    const { inventory } = usePetInventoryContext()
    const { species } = usePetSpeciesContext()
    const metaOf = useMemo(() => new Map(species.map(s => [s.speciesId, s])), [species])

    const [name, setName] = useState(initial?.name ?? '')
    const [picked, setPicked] = useState<string[]>(initial?.members.map(m => m.instanceId) ?? [])
    const [error, setError] = useState<string | null>(null)

    const byId = useMemo(() => new Map(inventory.map(p => [p.instanceId, p])), [inventory])

    const toggle = (id: string) => {
        setPicked(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id)
            if (prev.length >= TEAM_SIZE) return prev
            return [...prev, id]
        })
    }

    const save = async () => {
        setError(null)
        try {
            await saveTeam(name.trim(), picked)
            onDone()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    const ready = name.trim().length > 0 && picked.length === TEAM_SIZE

    const slots = Array.from({ length: TEAM_SIZE }, (_, i) => picked[i])

    return (
        <div className="flex flex-col gap-3 p-5 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-semibold text-center">{initial ? `Edit “${initial.name}”` : 'New Team'}</h2>

            <input
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!!initial}
                maxLength={24}
                placeholder="Team name"
                className="border rounded-lg px-3 py-1 text-center disabled:opacity-60"
            />

            {/* the bench — the 5 slots */}
            <div className="flex justify-center gap-2 py-2 border-y">
                {slots.map((id, i) => {
                    const inst = id ? byId.get(id) : undefined
                    const meta = inst ? metaOf.get(inst.speciesId) : undefined
                    return (
                        <div
                            key={i}
                            onClick={() => id && toggle(id)}
                            className={`flex items-center justify-center rounded-lg border w-16 h-20 ${id ? 'cursor-pointer border-solid hover:border-rose-500' : 'border-dashed opacity-50'}`}
                            title={id ? 'Remove' : 'Empty'}
                        >
                            {inst && meta ? (
                                <PetPortrait
                                    meta={meta}
                                    level={inst.level}
                                    attack={meta.baseAttack * inst.level}
                                    health={meta.baseHealth * inst.level}
                                />
                            ) : (
                                <span className="text-2xl opacity-40">+</span>
                            )}
                        </div>
                    )
                })}
            </div>

            <p className="text-center text-xs opacity-60">Pick {TEAM_SIZE} pets ({picked.length}/{TEAM_SIZE})</p>

            {/* the roster */}
            {inventory.length === 0 ? (
                <p className="text-center opacity-60 py-4">No pets yet — open a lootbox first.</p>
            ) : (
                <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
                    {inventory.map(p => {
                        const meta = metaOf.get(p.speciesId)
                        if (!meta) return null
                        const on = picked.includes(p.instanceId)
                        return (
                            <div
                                key={p.instanceId}
                                onClick={() => toggle(p.instanceId)}
                                className={`flex flex-col items-center rounded-lg border p-1 cursor-pointer transition-colors ${on ? 'border-sky-500 bg-sky-500/10' : 'hover:border-white/40'}`}
                            >
                                <PetPortrait
                                    meta={meta}
                                    level={p.level}
                                    attack={meta.baseAttack * p.level}
                                    health={meta.baseHealth * p.level}
                                />
                                <span className="text-[10px] truncate max-w-full" style={{ color: RARITY_COLOR[meta.rarity] }}>
                                    {p.nickname || meta.displayName}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}

            {error && <p className="text-rose-400 text-sm text-center">{error}</p>}

            <div className="flex justify-center gap-2">
                <button onClick={onCancel} className="rounded-xl px-4 py-1 border">Cancel</button>
                <button
                    onClick={save}
                    disabled={!ready || busy}
                    className={`rounded-xl px-4 py-1 text-white ${ready && !busy ? 'bg-green-600 hover:bg-green-800' : 'bg-teal-900 cursor-default'}`}
                >
                    {busy ? 'Saving…' : 'Save Team'}
                </button>
            </div>
        </div>
    )
}
