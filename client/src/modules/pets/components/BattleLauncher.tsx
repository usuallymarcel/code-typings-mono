// client/src/modules/pets/components/BattleLauncher.tsx
import { useState } from 'react'
import { useModal } from '../../../components/modal/ModalContext'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { useBattleContext } from '../contexts/BattleContext'
import { TeamBuilder } from './TeamBuilder'
import { MergePanel } from './MergePanel'
import { BattleArena } from './BattleArena'

// Fixed launcher button — mirrors how <Pets/> mounts a fixed overlay.
export function BattleLauncher() {
    const { openModal } = useModal()

    return (
        <button
            onClick={() => openModal(<BattlePanel />)}
            className="fixed bottom-4 right-4 z-[60] rounded-full px-5 py-3 text-black font-bold bg-amber-400 hover:bg-amber-300 shadow-lg pointer-events-auto"
        >
            ⚔ Battle
        </button>
    )
}

type Tab = 'team' | 'merge'

function BattlePanel() {
    const { openModal } = useModal()
    const { profile, fight } = useBattleContext()
    const { points } = usePointsContext()
    const [tab, setTab] = useState<Tab>('team')
    const [fighting, setFighting] = useState(false)
    const [errMsg, setErrMsg] = useState<string | null>(null)

    const startFight = async () => {
        try {
            setFighting(true)
            setErrMsg(null)
            const result = await fight()
            // Hand off to the arena (replaces this panel in the modal slot).
            openModal(<BattleArena fight={result} />)
        } catch (err) {
            setErrMsg((err as Error).message)
        } finally {
            setFighting(false)
        }
    }

    return (
        <div className="flex flex-col gap-3 p-4 rounded-xl [background:var(--bg)] border min-w-[480px] max-w-[560px]">
            {/* ladder header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Arena</h2>
                <div className="flex gap-3 text-sm">
                    <span>🏆 {profile?.trophies ?? 0}</span>
                    <span>🔥 {profile?.streak ?? 0}</span>
                    <span className="opacity-70">Points: {points ?? '—'}</span>
                </div>
            </div>

            {/* tabs */}
            <div className="flex gap-2">
                <button
                    onClick={() => setTab('team')}
                    className={`rounded-xl px-3 py-1 text-sm ${tab === 'team' ? 'bg-white/10' : 'opacity-60'}`}
                >Team</button>
                <button
                    onClick={() => setTab('merge')}
                    className={`rounded-xl px-3 py-1 text-sm ${tab === 'merge' ? 'bg-white/10' : 'opacity-60'}`}
                >Merge</button>
            </div>

            {tab === 'team' ? <TeamBuilder /> : <MergePanel />}

            {/* fight action */}
            <div className="flex items-center justify-between border-t border-white/10 pt-3">
                {errMsg ? (
                    <span className="text-xs text-red-400">{errMsg}</span>
                ) : (
                    <span className="text-xs opacity-60">Front pet fights first. Win for points + trophies.</span>
                )}
                <button
                    onClick={startFight}
                    disabled={fighting}
                    className="rounded-xl px-5 py-2 text-black font-bold bg-red-500 hover:bg-red-400 disabled:opacity-50"
                >
                    {fighting ? 'Fighting…' : 'Fight!'}
                </button>
            </div>
        </div>
    )
}
