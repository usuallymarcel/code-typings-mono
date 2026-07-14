import { useMemo, useState } from 'react'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { usePetSpeciesContext } from '../contexts/PetSpeciesContext'
import type { PetInstance, SpeciesEntry } from '../models/pet'
import { PetPortrait } from './PetPortrait'
import { RARITY_COLOR } from './rarity'
import styles from './battle.module.css'

const DROP_OFFSETS = ['22%', '46%', '68%']
const DROP_DELAYS = ['0s', '0.15s', '0.3s']

const sacrificesNeeded = (level: number) => Math.min(level * 3, 3)

type Snap = { name: string; vessel: PetInstance; offerings: PetInstance[]; meta: SpeciesEntry | undefined }

export function MergeAltar({ onCancel }: { onCancel: () => void }) {
    const { inventory, merge } = usePetInventoryContext()
    const { species } = usePetSpeciesContext()
    const metaOf = useMemo(() => new Map(species.map(s => [s.speciesId, s])), [species])

    const [speciesId, setSpeciesId] = useState<string | null>(null)
    const [doomed, setDoomed] = useState<string[]>([])
    const [phase, setPhase] = useState<'idle' | 'ritual' | 'done'>('idle')
    const [snap, setSnap] = useState<Snap | null>(null)
    const [newLevel, setNewLevel] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    // group owned pets by species; only species you own 2+ of can feed a ritual
    const groups = useMemo(() => {
        const m = new Map<string, PetInstance[]>()
        for (const p of inventory) {
            const arr = m.get(p.speciesId) ?? []
            arr.push(p)
            m.set(p.speciesId, arr)
        }
        return m
    }, [inventory])

    const eligible = [...groups.entries()].filter(([, arr]) => arr.length >= 2)

    const chosen = speciesId ? groups.get(speciesId) ?? [] : []
    const vessel = chosen.length ? chosen.reduce((a, b) => (b.level > a.level ? b : a)) : undefined
    const available = vessel ? chosen.filter(p => p.instanceId !== vessel.instanceId) : []
    const needed = vessel ? sacrificesNeeded(vessel.level) : 0
    const enough = available.length >= needed

    const pickSpecies = (id: string) => {
        const arr = groups.get(id) ?? []
        const v = arr.reduce((a, b) => (b.level > a.level ? b : a))
        const rest = arr.filter(p => p.instanceId !== v.instanceId).sort((a, b) => a.level - b.level)
        setSpeciesId(id)
        setDoomed(rest.slice(0, sacrificesNeeded(v.level)).map(p => p.instanceId))
        setError(null)
    }

    const toggleDoomed = (id: string) => {
        setDoomed(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id)
            if (prev.length >= needed) return prev
            return [...prev, id]
        })
    }

    const performRitual = async () => {
        if (!vessel || doomed.length !== needed) return
        setError(null)
        setSnap({
            name: vessel.nickname || metaOf.get(vessel.speciesId)?.displayName || vessel.speciesId,
            vessel,
            offerings: doomed.map(id => chosen.find(p => p.instanceId === id)!).filter(Boolean),
            meta: metaOf.get(vessel.speciesId),
        })
        setPhase('ritual')
        try {
            const [target] = await Promise.all([
                merge(vessel.instanceId, doomed),
                new Promise(r => setTimeout(r, 850)),
            ])
            setNewLevel(target.level)
            setPhase('done')
        } catch (e) {
            setError((e as Error).message)
            setPhase('idle')
            setSnap(null)
        }
    }

    const reset = () => {
        setPhase('idle')
        setSnap(null)
        setNewLevel(null)
        setSpeciesId(null)
        setDoomed([])
    }

    // ---- ritual / result screen ------------------------------------------
    if ((phase === 'ritual' || phase === 'done') && snap) {
        return (
            <div className="flex flex-col items-center gap-4 p-6 [background:var(--bg)] rounded-xl border w-full">
                <h2 className="text-lg font-bold text-rose-500">{phase === 'ritual' ? 'The ritual begins…' : 'The deed is done.'}</h2>

                <div className="relative flex items-center justify-center h-32 w-full">
                    {phase === 'ritual' && <div className={styles.splat} />}
                    <div className={phase === 'done' ? styles.levelUp : ''}>
                        <PetPortrait meta={snap.meta} scale={2} level={phase === 'done' ? (newLevel ?? snap.vessel.level) : snap.vessel.level} />
                    </div>
                </div>

                {/* the doomed, bleeding out */}
                <div className="flex gap-3">
                    {snap.offerings.map(o => (
                        <div key={o.instanceId} className="relative">
                            <div className={styles.bleed}>
                                {DROP_OFFSETS.map((left, i) => (
                                    <span key={i} className={styles.drop} style={{ left, animationDelay: DROP_DELAYS[i] }} />
                                ))}
                            </div>
                            <div className={styles.consumed}>
                                <PetPortrait meta={snap.meta} />
                            </div>
                        </div>
                    ))}
                </div>

                {phase === 'done' && (
                    <div className="flex flex-col items-center gap-1 text-center">
                        <span className="text-2xl font-black text-amber-400">LEVEL {newLevel} 🎉</span>
                        <p className="text-sm opacity-80">
                            <span className="font-semibold">{snap.name}</span> devoured {snap.offerings.length} of its own kind.
                        </p>
                        <p className="text-xs opacity-50 italic">It doesn’t remember them. You will.</p>
                        <div className="flex gap-2 mt-3">
                            <button onClick={reset} className="rounded-xl px-4 py-1 bg-rose-700 hover:bg-rose-800 text-white">Again 🔪</button>
                            <button onClick={onCancel} className="rounded-xl px-4 py-1 border">Done</button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // ---- species picker ---------------------------------------------------
    if (!speciesId) {
        return (
            <div className="flex flex-col gap-3 p-5 [background:var(--bg)] rounded-xl border w-full">
                <h2 className="text-lg font-bold text-center text-rose-500">🩸 Sacrificial Altar</h2>
                <p className="text-center text-xs opacity-60 -mt-1">
                    Feed a pet its own kin to make it stronger. They consented.* <span className="italic">(*they did not)</span>
                </p>

                {eligible.length === 0 ? (
                    <p className="text-center opacity-60 py-6">You need 2+ of the same pet to hold a ritual. Go open some lootboxes, you monster.</p>
                ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                        {eligible.map(([id, arr]) => {
                            const meta = metaOf.get(id)
                            if (!meta) return null
                            return (
                                <div
                                    key={id}
                                    onClick={() => pickSpecies(id)}
                                    className="relative flex flex-col items-center rounded-lg border p-1 cursor-pointer hover:border-rose-500"
                                >
                                    <span className="absolute -top-1 -right-1 z-6 rounded-full bg-rose-600 text-white text-[10px] font-bold px-1">×{arr.length}</span>
                                    <PetPortrait meta={meta} />
                                    <span className="text-[10px] truncate max-w-full" style={{ color: RARITY_COLOR[meta.rarity] }}>{meta.displayName}</span>
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className="flex justify-center">
                    <button onClick={onCancel} className="rounded-xl px-4 py-1 border">Back</button>
                </div>
            </div>
        )
    }

    // ---- ritual setup for the chosen species ------------------------------
    const meta = metaOf.get(speciesId)
    return (
        <div className="flex flex-col items-center gap-3 p-5 [background:var(--bg)] rounded-xl border w-full">
            <h2 className="text-lg font-bold text-center">
                <span style={{ color: meta ? RARITY_COLOR[meta.rarity] : undefined }}>{meta?.displayName}</span> Ritual
            </h2>

            <div className="flex flex-col items-center gap-1">
                <span className="text-xs uppercase tracking-widest opacity-60">The Vessel</span>
                <PetPortrait meta={meta} scale={1.6} level={vessel?.level} />
                <span className="text-xs opacity-60">Lv {vessel?.level} → <span className="text-amber-400 font-bold">Lv {(vessel?.level ?? 1) + 1}</span></span>
            </div>

            <div className="w-full border-t pt-2">
                <p className="text-center text-xs uppercase tracking-widest text-rose-500 mb-2">
                    The Doomed — choose {needed} ({doomed.length}/{needed})
                </p>
                {!enough ? (
                    <p className="text-center text-sm text-rose-400">
                        You need {needed - available.length} more {meta?.displayName} to feed this ritual.
                    </p>
                ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                        {available.map(p => {
                            const on = doomed.includes(p.instanceId)
                            return (
                                <div
                                    key={p.instanceId}
                                    onClick={() => toggleDoomed(p.instanceId)}
                                    className={`flex flex-col items-center rounded-lg border p-1 cursor-pointer transition ${on ? 'border-rose-600 bg-rose-600/15 grayscale-0' : 'opacity-70 hover:opacity-100'}`}
                                >
                                    <PetPortrait meta={meta} level={p.level} />
                                    <span className="text-[10px]">{on ? '💀' : `Lv${p.level}`}</span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {error && <p className="text-rose-400 text-sm">{error}</p>}

            <div className="flex justify-center gap-2">
                <button onClick={() => { setSpeciesId(null); setDoomed([]) }} className="rounded-xl px-4 py-1 border">Back</button>
                <button
                    onClick={performRitual}
                    disabled={!enough || doomed.length !== needed}
                    className={`rounded-xl px-4 py-1 font-bold text-white ${enough && doomed.length === needed ? 'bg-rose-700 hover:bg-rose-800' : 'bg-rose-900/50 cursor-default'}`}
                >
                    🔪 Sacrifice {needed}
                </button>
            </div>
        </div>
    )
}
