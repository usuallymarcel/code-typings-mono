import { useEffect, useMemo, useState } from 'react'
import { usePetSpeciesContext } from '../contexts/PetSpeciesContext'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { useBattle } from '../hooks/useBattle'
import type { BattleTeam, FightResult } from '../models/battle'
import { PetPortrait } from './PetPortrait'
import { TeamBuilder } from './TeamBuilder'
import { MergeAltar } from './MergeAltar'
import { BattleArena } from './BattleArena'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'

type View = 'hub' | 'build' | 'altar' | 'fight'

export function BattleModal() {
    const { teams, loading, busy, refetch, saveTeam, fight } = useBattle()
    const { species } = usePetSpeciesContext()
    const { setPoints } = usePointsContext()
    const metaOf = useMemo(() => new Map(species.map(s => [s.speciesId, s])), [species])

    const [view, setView] = useState<View>('hub')
    const [editing, setEditing] = useState<BattleTeam | undefined>(undefined)
    const [active, setActive] = useState<BattleTeam | undefined>(undefined)
    const [fightResult, setFightResult] = useState<FightResult | null>(null)
    const [nonce, setNonce] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const { refetch: refetchInventory } = usePetInventoryContext()

    useEffect(() => {
        refetchInventory()
    }, [refetchInventory])

    const goHub = () => { setError(null); setView('hub'); refetch() }

    const runFight = async (team: BattleTeam) => {
        setError(null)
        setActive(team)
        try {
            const res = await fight(team.id)
            setFightResult(res)
            setNonce(n => n + 1)
            setView('fight')
            setPoints(res.pointsRemaining)
            refetch()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    if (view === 'build') {
        return (
            <div className="w-140 max-w-full">
                <TeamBuilder initial={editing} saveTeam={saveTeam} busy={busy} onDone={goHub} onCancel={goHub} />
            </div>
        )
    }

    if (view === 'altar') {
        return (
            <div className="w-140 max-w-full">
                <MergeAltar onCancel={goHub} />
            </div>
        )
    }

    if (view === 'fight' && fightResult) {
        return (
            <div className="w-140 max-w-full">
                <BattleArena
                    key={nonce}
                    result={fightResult}
                    species={species}
                    onExit={goHub}
                    onRematch={() => active && runFight(active)}
                    canRematch={!!active}
                />
            </div>
        )
    }

    // ---- hub --------------------------------------------------------------
    return (
        <div className="w-140 max-w-full flex flex-col gap-3 p-5 [background:var(--bg)] rounded-xl border">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">⚔️ Battles</h2>
                <div className="flex gap-2">
                    <button onClick={() => { setEditing(undefined); setView('build') }} className="rounded-lg px-3 py-1 border text-sm hover:bg-white/10">＋ New Team</button>
                    <button onClick={() => setView('altar')} className="rounded-lg px-3 py-1 border border-rose-600 text-rose-400 text-sm hover:bg-rose-600/10">🩸 Altar</button>
                </div>
            </div>

            {error && <p className="text-rose-400 text-sm">{error}</p>}

            {loading && teams.length === 0 ? (
                <p className="opacity-60 py-6 text-center">Loading…</p>
            ) : teams.length === 0 ? (
                <p className="opacity-60 py-6 text-center">No teams yet. Build one.</p>
            ) : (
                <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
                    {teams.map(team => (
                        <div key={team.id} className="border rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold">{team.name}</span>
                                <span className="text-xs opacity-70">🏆 {team.trophies} · 🔥 {team.streak} · {team.wins}W/{team.losses}L</span>
                            </div>

                            <div className="flex items-end gap-1 overflow-x-auto pb-1">
                                {team.members.length === 0 ? (
                                    <span className="text-xs text-rose-400">empty — edit to add pets</span>
                                ) : (
                                    team.members.map(m => {
                                        const meta = metaOf.get(m.speciesId)
                                        return (
                                            <PetPortrait
                                                key={m.instanceId}
                                                meta={meta}
                                                scale={1}
                                                level={m.level}
                                                attack={meta ? meta.baseAttack * m.level : undefined}
                                                health={meta ? meta.baseHealth * m.level : undefined}
                                            />
                                        )
                                    })
                                )}
                            </div>

                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={() => runFight(team)}
                                    disabled={busy || team.members.length === 0}
                                    className={`flex-1 rounded-lg px-3 py-1 text-white ${busy || team.members.length === 0 ? 'bg-teal-900 cursor-default' : 'bg-green-600 hover:bg-green-800'}`}
                                >
                                    {busy ? '…' : 'Fight'}
                                </button>
                                <button
                                    onClick={() => { setEditing(team); setView('build') }}
                                    className="rounded-lg px-3 py-1 border hover:bg-white/10"
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
