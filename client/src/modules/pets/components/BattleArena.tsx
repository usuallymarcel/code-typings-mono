import { useEffect, useMemo, useRef, useState } from 'react'
import type { SpeciesEntry } from '../models/pet'
import type { BattleEffect, BattleResult, FightResult, PetSnapshot, Side } from '../models/battle'
import { PetPortrait, type Flyout } from './PetPortrait'
import styles from './battle.module.css'

const SCALE = 0.8
const T = { start: 550, ability: 620, effect: 660, clash: 720, faint: 420, gap: 130 }

type ArenaPet = {
    uid: string
    speciesId: string
    name: string
    rarity: PetSnapshot['rarity']
    attack: number
    health: number
    maxHealth: number
    level: number
    fainting?: boolean
    flyout?: Flyout
}

type Model = { player: ArenaPet[]; enemy: ArenaPet[] }

function toArena(s: PetSnapshot, side: Side, i: number): ArenaPet {
    return {
        uid: s.instanceId ?? `${side}-${i}`,
        speciesId: s.speciesId,
        name: s.name,
        rarity: s.rarity,
        attack: s.attack,
        health: s.health,
        maxHealth: s.maxHealth,
        level: s.level,
    }
}

const buildModel = (result: FightResult): Model => ({
    player: result.playerTeam.map((s, i) => toArena(s, 'player', i)),
    enemy: result.enemyTeam.map((s, i) => toArena(s, 'enemy', i)),
})

// fresh pet objects so React sees the change and re-animates flyouts
const cloneModel = (m: Model): Model => ({
    player: m.player.map(p => ({ ...p })),
    enemy: m.enemy.map(p => ({ ...p })),
})

const RESULT_COPY: Record<BattleResult, { title: string; color: string; sub: string }> = {
    win: { title: 'VICTORY', color: '#4ade80', sub: 'The points are yours.' },
    loss: { title: 'DEFEAT', color: '#f87171', sub: 'Your pets have been humbled.' },
    draw: { title: 'DRAW', color: '#fbbf24', sub: 'Everyone loses, kind of.' },
}

export function BattleArena({
    result,
    species,
    onExit,
    onRematch,
    canRematch,
}: {
    result: FightResult
    species: SpeciesEntry[]
    onExit: () => void
    onRematch: () => void
    canRematch: boolean
}) {
    const metaMap = useMemo(() => new Map(species.map(s => [s.speciesId, s])), [species])

    const flyoutId = useRef(0)
    const [model, setModel] = useState<Model>(() => buildModel(result))
    const [clashing, setClashing] = useState(false)
    const [banner, setBanner] = useState<BattleResult | null>(null)

    const newHighest = result.newHighest

    useEffect(() => {
        let cancelled = false
        const timers: ReturnType<typeof setTimeout>[] = []
        const sleep = (ms: number) => new Promise<void>(res => { timers.push(setTimeout(res, ms)) })

        // the effect owns a private working copy; the view is a published snapshot
        const work = buildModel(result)
        const publish = () => setModel(cloneModel(work))

        const fx = (pet: ArenaPet, text: string, kind: Flyout['kind']) => {
            pet.flyout = { id: ++flyoutId.current, text, kind }
        }

        const applyEffect = (e: BattleEffect) => {
            const line = e.side === 'player' ? work.player : work.enemy
            const pet = line[e.index]
            if (!pet) return
            if (e.type === 'damage') {
                pet.health -= e.amount
                fx(pet, `-${e.amount}`, 'dmg')
            } else if (e.type === 'heal') {
                pet.health += e.amount
                pet.maxHealth = Math.max(pet.maxHealth, pet.health)
                fx(pet, `+${e.amount}`, 'heal')
            } else {
                const dh = e.dHealth ?? 0
                const da = e.dAttack ?? 0
                if (da) pet.attack += da
                if (dh) { pet.health += dh; pet.maxHealth = Math.max(pet.maxHealth, pet.health) }
                const parts: string[] = []
                if (da) parts.push(`${da > 0 ? '+' : ''}${da}⚔`)
                if (dh) parts.push(`${dh > 0 ? '+' : ''}${dh}❤`)
                fx(pet, parts.join(' '), dh < 0 && !da ? 'dmg' : 'buff')
            }
        }

        const run = async () => {
            await sleep(T.start)
            if (cancelled) return

            for (const ev of result.events) {
                if (cancelled) return

                if (ev.type === 'ability') {
                    const line = ev.side === 'player' ? work.player : work.enemy
                    const src = line[ev.sourceIndex]
                    if (src) fx(src, ev.abilityName, 'ability')
                    publish()
                    await sleep(T.ability)
                    if (cancelled) return
                    ev.effects.forEach(applyEffect)
                    publish()
                    await sleep(T.effect)
                } else if (ev.type === 'attack') {
                    if (work.player[0]) work.player[0].health = ev.playerHealthAfter
                    if (work.enemy[0]) work.enemy[0].health = ev.enemyHealthAfter
                    if (ev.playerDamage > 0 && work.enemy[0]) fx(work.enemy[0], `-${ev.playerDamage}`, 'dmg')
                    if (ev.enemyDamage > 0 && work.player[0]) fx(work.player[0], `-${ev.enemyDamage}`, 'dmg')
                    setClashing(true)
                    publish()
                    await sleep(320)
                    if (cancelled) return
                    setClashing(false)
                    await sleep(T.clash - 320)
                } else if (ev.type === 'faint') {
                    const line = ev.side === 'player' ? work.player : work.enemy
                    const pet = line[ev.index]
                    if (pet) {
                        pet.fainting = true
                        publish()
                        await sleep(T.faint)
                        if (cancelled) return
                        line.splice(ev.index, 1)
                        publish()
                    }
                } else if (ev.type === 'end') {
                    await sleep(T.gap)
                    if (cancelled) return
                    setBanner(ev.result)
                }
                await sleep(T.gap)
            }
        }

        run()
        return () => {
            cancelled = true
            timers.forEach(clearTimeout)
        }
    }, [result])

    const renderSide = (line: ArenaPet[], side: Side) => (
        <div className={`flex items-end gap-1 ${side === 'player' ? 'flex-row-reverse' : ''}`}>
            {line.map((pet, idx) => {
                const isFront = idx === 0
                const lunge = isFront && clashing ? (side === 'player' ? styles.lungeRight : styles.lungeLeft) : ''
                return (
                    <div key={pet.uid} className={lunge}>
                        <PetPortrait
                            meta={metaMap.get(pet.speciesId)}
                            scale={SCALE}
                            facing={side === 'player' ? 'right' : 'left'}
                            attack={pet.attack}
                            health={pet.health}
                            maxHealth={pet.maxHealth}
                            level={pet.level}
                            name={pet.name}
                            showBar
                            fainting={pet.fainting}
                            flyout={pet.flyout}
                        />
                    </div>
                )
            })}
        </div>
    )

    return (
        <div className="flex flex-col items-center gap-3 p-5 [background:var(--bg)] rounded-xl border w-full">
            {!banner && <div className="flex items-center gap-10 text-sm">
                <span className="text-sky-400 font-semibold">You</span>
                {/* <span className="opacity-50">·🏆 {result.trophiesAfter} · 🔥 {result.streakAfter}</span> */}
                <span className="text-rose-400 font-semibold ml-1">Foe</span>
            </div>}

            <div className={`w-full overflow-x-auto ${clashing ? styles.hitShake : ''}`}>
                <div className="flex items-end gap-3 min-h-37.5 px-2">
                    {renderSide(model.player, 'player')}
                    {!banner && <span className="self-center text-lg font-black opacity-40 shrink-0">VS</span>}
                    {renderSide(model.enemy, 'enemy')}
                </div>
            </div>

            {banner ? (
                <div className={`flex flex-col items-center gap-1 ${styles.banner}`}>
                    <span className="text-4xl font-black tracking-wider" style={{ color: RESULT_COPY[banner].color }}>
                        {RESULT_COPY[banner].title}
                    </span>
                    {/* <span className="text-sm opacity-70">{RESULT_COPY[banner].sub}</span> */}
                    <span className="text-sm opacity-70">
                        {!newHighest ? `Not good enough for points. Current tier: ${result.trophiesAfter}, Highest: ${result.hightestTrophies}` : 'New highest tier'}
                    </span>
                    {newHighest && <span className="text-lg font-bold mt-1">
                        {result.reward > 0 ? `+${result.reward} points` : 'No points'}
                    </span>}
                    <div className="flex gap-2 mt-2">
                        {canRematch && (
                            <button onClick={onRematch} className="rounded-xl px-4 py-1 bg-green-600 hover:bg-green-800 text-white">
                                Rematch
                            </button>
                        )}
                        <button onClick={onExit} className="rounded-xl px-4 py-1 border">Back</button>
                    </div>
                </div>
            ) : (
                <span className="text-xs opacity-50 h-6"></span>
            )}
        </div>
    )
}
