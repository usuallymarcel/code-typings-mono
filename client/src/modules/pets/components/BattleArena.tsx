// client/src/modules/pets/components/BattleArena.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../../../components/modal/ModalContext'
import { usePointsContext } from '../../points/contexts/PointsContext'
import { usePetInventoryContext } from '../contexts/PetInventoryContext'
import { usePetSpecies } from '../hooks/usePetSpecies'
import { RARITY_COLOR } from './rarity'
import { spriteThumbStyle, spriteThumbUrl } from './spriteThumb'
import type { SpeciesEntry } from '../models/pet'
import type {
    BattleEffect,
    BattleEvent,
    BattleSide,
    FightResponse,
    PetSnapshot,
} from '../models/battle'

// Per-event playback delays (ms). Snapped to 0 when reduced-motion is on.
const T_ABILITY = 700
const T_ATTACK = 650
const T_FAINT = 500
const T_SUMMON = 550
const LUNGE_MS = 220
const POPUP_MS = 1100

// A snapshot tagged with its side, used ONLY locally while seeding lines.
// `side` is never added to the shared PetSnapshot (server union has none).
type SidedSnapshot = PetSnapshot & { side: BattleSide }

// Live, animatable on-screen pet. `key` is stable for the tile's lifetime so a
// fainting pet keeps its own DOM node while the survivor behind it shifts in.
interface ArenaPet {
    key: string
    snap: PetSnapshot
    attack: number
    health: number
    maxHealth: number
    lunging: boolean
    hurt: boolean
    fainting: boolean
    summoning: boolean
}

interface FloatingPopup {
    id: number
    side: BattleSide
    index: number
    title: string
    lines: string[]
}

let _popupId = 0
let _keyId = 0

// `side` is no longer part of the key — a monotonic counter guarantees
// uniqueness, so toArenaPet works on a plain PetSnapshot.
function toArenaPet(snap: PetSnapshot): ArenaPet {
    return {
        key: `${snap.instanceId ?? snap.speciesId}-${_keyId++}`,
        snap,
        attack: snap.attack,
        health: snap.health,
        maxHealth: snap.maxHealth,
        lunging: false,
        hurt: false,
        fainting: false,
        summoning: false,
    }
}

// Human-readable summary of an ability's effects for the floating popup.
function describeEffects(effects: BattleEffect[]): string[] {
    return effects.map(e => {
        const parts: string[] = []
        if (e.dAttack) parts.push(`${e.dAttack > 0 ? '+' : ''}${e.dAttack} atk`)
        if (e.dHealth) parts.push(`${e.dHealth > 0 ? '+' : ''}${e.dHealth} hp`)
        const who = e.side === 'player' ? 'ally' : 'enemy'
        return parts.length ? `${who} #${e.index + 1}: ${parts.join(', ')}` : `${who} #${e.index + 1}`
    })
}

export function BattleArena({ fight }: { fight: FightResponse }) {
    const { closeModal } = useModal()
    const { species } = usePetSpecies()
    const { fetchPoints } = usePointsContext()
    const { refetch: refetchInventory } = usePetInventoryContext()

    const speciesById = useMemo(() => {
        const map = new Map<string, SpeciesEntry>()
        for (const s of species) map.set(s.speciesId, s)
        return map
    }, [species])

    const [playerLine, setPlayerLine] = useState<ArenaPet[]>([])
    const [enemyLine, setEnemyLine] = useState<ArenaPet[]>([])
    const [popups, setPopups] = useState<FloatingPopup[]>([])
    const [ended, setEnded] = useState<'win' | 'loss' | 'draw' | null>(null)

    // Mutable working copies so the stepper can read/write lines synchronously
    // between React commits without racing stale state.
    const player = useRef<ArenaPet[]>([])
    const enemy = useRef<ArenaPet[]>([])
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])

    const lineRef = (side: BattleSide) =>
        side === 'player' ? player : enemy
    const setLine = (side: BattleSide, next: ArenaPet[]) =>
        side === 'player' ? setPlayerLine(next) : setEnemyLine(next)

    // Refunds points + inventory once playback (or snap) settles on the result.
    const settle = (result: 'win' | 'loss' | 'draw') => {
        setEnded(result)
        fetchPoints()
        refetchInventory()
    }

    useEffect(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        // Seed both lines from the start event (falling back to the team arrays).
        // The local `side` tag is only here for symmetry/readability; the key
        // no longer depends on it.
        const start = fight.events.find(e => e.type === 'start')
        const startPlayer: SidedSnapshot[] = (start && start.type === 'start' ? start.player : fight.playerTeam)
            .map(p => ({ ...p, side: 'player' as const }))
        const startEnemy: SidedSnapshot[] = (start && start.type === 'start' ? start.enemy : fight.enemyTeam)
            .map(p => ({ ...p, side: 'enemy' as const }))

        player.current = startPlayer.map(toArenaPet)
        enemy.current = startEnemy.map(toArenaPet)
        setPlayerLine([...player.current])
        setEnemyLine([...enemy.current])

        if (reduce) {
            // Snap: apply every event with zero animation, show the banner.
            for (const ev of fight.events) applyEvent(ev, true)
            setPlayerLine([...player.current])
            setEnemyLine([...enemy.current])
            settle(fight.result)
            return
        }

        // Schedule the events back-to-back, each after the prior's animation.
        let delay = 250
        for (const ev of fight.events) {
            const dur = durationFor(ev)
            const at = delay
            timers.current.push(setTimeout(() => playEvent(ev), at))
            delay += dur
        }

        return () => {
            for (const t of timers.current) clearTimeout(t)
            timers.current = []
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fight])

    function durationFor(ev: BattleEvent): number {
        switch (ev.type) {
            case 'ability': return T_ABILITY
            case 'attack': return T_ATTACK
            case 'faint': return T_FAINT
            case 'summon': return T_SUMMON
            default: return 200
        }
    }

    // Animated path: mutate refs, flush to state, clear transient flags after.
    function playEvent(ev: BattleEvent) {
        applyEvent(ev, false)
        setPlayerLine([...player.current])
        setEnemyLine([...enemy.current])

        if (ev.type === 'attack') {
            timers.current.push(setTimeout(() => {
                for (const p of player.current) { p.lunging = false; p.hurt = false }
                for (const e of enemy.current) { e.lunging = false; e.hurt = false }
                setPlayerLine([...player.current])
                setEnemyLine([...enemy.current])
            }, LUNGE_MS))
        }

        if (ev.type === 'end') settle(ev.result)
    }

    // Core reducer: applies one event to the working lines. `snap` = no anim.
    function applyEvent(ev: BattleEvent, snap: boolean) {
        switch (ev.type) {
            case 'start':
                // Lines already built in the effect; nothing further to do.
                break

            case 'ability': {
                for (const eff of ev.effects) {
                    const line = lineRef(eff.side).current
                    const pet = line[eff.index]
                    if (!pet) continue
                    if (eff.dAttack) pet.attack = Math.max(0, pet.attack + eff.dAttack)
                    if (eff.dHealth) {
                        pet.health = Math.max(0, pet.health + eff.dHealth)
                        if (pet.health > pet.maxHealth) pet.maxHealth = pet.health
                    }
                }
                if (!snap) pushPopup(ev.side, ev.sourceIndex, ev.abilityName, describeEffects(ev.effects), ev.note)
                break
            }

            case 'attack': {
                const pf = player.current[0]
                const ef = enemy.current[0]
                if (pf) { pf.health = ev.playerHealthAfter; if (!snap) { pf.lunging = true; pf.hurt = ev.enemyDamage > 0 } }
                if (ef) { ef.health = ev.enemyHealthAfter; if (!snap) { ef.lunging = true; ef.hurt = ev.playerDamage > 0 } }
                break
            }

            case 'faint': {
                const line = lineRef(ev.side).current
                const pet = line[ev.index]
                if (!pet) break
                if (snap) {
                    line.splice(ev.index, 1)
                } else {
                    // Fade the tile out, then remove it (line shifts forward).
                    pet.fainting = true
                    timers.current.push(setTimeout(() => {
                        const i = line.indexOf(pet)
                        if (i >= 0) line.splice(i, 1)
                        setLine(ev.side, [...line])
                    }, T_FAINT - 80))
                }
                break
            }

            case 'summon': {
                const line = lineRef(ev.side).current
                const fresh = toArenaPet(ev.pet)
                if (!snap) fresh.summoning = true
                line.splice(ev.index, 0, fresh)
                if (!snap) {
                    timers.current.push(setTimeout(() => {
                        fresh.summoning = false
                        setLine(ev.side, [...line])
                    }, T_SUMMON - 80))
                }
                break
            }

            case 'end':
                // Banner is shown by playEvent/settle.
                break
        }
    }

    function pushPopup(
        side: BattleSide,
        index: number,
        title: string,
        lines: string[],
        note?: string,
    ) {
        const id = _popupId++
        const all = note ? [note, ...lines] : lines
        setPopups(prev => [...prev, { id, side, index, title, lines: all }])
        timers.current.push(setTimeout(() => {
            setPopups(prev => prev.filter(p => p.id !== id))
        }, POPUP_MS))
    }

    return (
        <div className="flex flex-col items-center gap-4 p-6 rounded-xl [background:var(--bg)] border min-w-[640px]">
            <h2 className="text-lg font-semibold tracking-wide">Battle</h2>

            <ArenaLine
                pets={enemyLine}
                side="enemy"
                popups={popups}
                speciesById={speciesById}
                facing={-1}
            />

            <div className="h-px w-full bg-white/10" />

            <ArenaLine
                pets={playerLine}
                side="player"
                popups={popups}
                speciesById={speciesById}
                facing={1}
            />

            {ended && (
                <ResultBanner result={ended} fight={fight} onClose={closeModal} />
            )}
        </div>
    )
}

// ---- One facing line of pet tiles ---------------------------------------

function ArenaLine({
    pets,
    side,
    popups,
    speciesById,
    facing,
}: {
    pets: ArenaPet[]
    side: BattleSide
    popups: FloatingPopup[]
    speciesById: Map<string, SpeciesEntry>
    facing: 1 | -1
}) {
    return (
        <div
            className={`flex items-end gap-3 w-full ${
                side === 'enemy' ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
            }`}
        >
            {pets.map((pet, index) => (
                <ArenaTile
                    key={pet.key}
                    pet={pet}
                    side={side}
                    index={index}
                    facing={facing}
                    species={speciesById.get(pet.snap.speciesId)}
                    popup={popups.find(p => p.side === side && p.index === index)}
                />
            ))}
            {pets.length === 0 && (
                <span className="opacity-40 text-sm py-8">— defeated —</span>
            )}
        </div>
    )
}

// ---- A single pet tile (sprite + health bar + lunge/hurt/faint anim) -----

function ArenaTile({
    pet,
    side,
    index,
    facing,
    species,
    popup,
}: {
    pet: ArenaPet
    side: BattleSide
    index: number
    facing: 1 | -1
    species?: SpeciesEntry
    popup?: FloatingPopup
}) {
    const color = RARITY_COLOR[pet.snap.rarity] ?? '#9ca3af'
    const url = spriteThumbUrl(species)
    const isFront = index === 0
    const hpPct = pet.maxHealth > 0
        ? Math.max(0, Math.min(100, (pet.health / pet.maxHealth) * 100))
        : 0

    // Lunge toward the opposing line; mirror enemy sprites to face the player.
    const lungeX = pet.lunging ? facing * 18 : 0
    const transform = `translateX(${lungeX}px) scaleX(${side === 'enemy' ? -1 : 1})`

    return (
        <div
            className="relative flex flex-col items-center gap-1"
            style={{
                opacity: pet.fainting ? 0 : 1,
                transition: 'opacity 360ms ease, transform 200ms ease',
                transform: pet.summoning ? 'scale(0.2)' : 'scale(1)',
            }}
        >
            {popup && (
                <div
                    className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-20 pointer-events-none whitespace-nowrap text-center"
                    style={{ animation: `floatup ${POPUP_MS}ms ease-out forwards` }}
                >
                    <div className="font-bold text-xs" style={{ color }}>
                        {popup.title}
                    </div>
                    {popup.lines.map((l, i) => (
                        <div key={i} className="text-[10px] opacity-80">{l}</div>
                    ))}
                </div>
            )}

            {/* sprite, mirrored for enemies, lunging on clash */}
            <div
                style={{
                    ...spriteThumbStyle(url),
                    transform,
                    transition: pet.lunging
                        ? `transform ${LUNGE_MS / 2}ms ease-out`
                        : 'transform 160ms ease-in',
                    filter: pet.hurt
                        ? 'brightness(2) drop-shadow(0 0 6px #ef4444)'
                        : `drop-shadow(0 0 4px ${color})`,
                }}
            />

            {/* name + FRONT badge */}
            <div className="flex items-center gap-1">
                {isFront && (
                    <span className="text-[9px] uppercase tracking-wider opacity-60">front</span>
                )}
                <span className="text-[11px] font-medium" style={{ color }}>
                    {pet.snap.displayName}
                </span>
            </div>

            {/* health bar (animates width on damage) */}
            <div className="w-16 h-2 rounded bg-white/10 overflow-hidden">
                <div
                    className="h-full rounded"
                    style={{
                        width: `${hpPct}%`,
                        background: hpPct > 33 ? '#22c55e' : '#ef4444',
                        transition: 'width 300ms ease, background 300ms ease',
                    }}
                />
            </div>

            {/* attack / health chips */}
            <div className="flex gap-1 text-[10px] font-mono">
                <span className="px-1 rounded bg-red-500/20 text-red-300">⚔ {pet.attack}</span>
                <span className="px-1 rounded bg-emerald-500/20 text-emerald-300">❤ {Math.max(0, pet.health)}</span>
            </div>
        </div>
    )
}

// ---- WIN / LOSS / DRAW banner with the reward ----------------------------

function ResultBanner({
    result,
    fight,
    onClose,
}: {
    result: 'win' | 'loss' | 'draw'
    fight: FightResponse
    onClose: () => void
}) {
    const label = result === 'win' ? 'VICTORY' : result === 'loss' ? 'DEFEAT' : 'DRAW'
    const color = result === 'win' ? '#22c55e' : result === 'loss' ? '#ef4444' : '#9ca3af'

    return (
        <div
            className="flex flex-col items-center gap-2 mt-2 px-6 py-4 rounded-xl border"
            style={{ boxShadow: `0 0 36px ${color}`, transition: 'box-shadow .3s' }}
        >
            <span className="text-2xl font-black tracking-widest" style={{ color }}>
                {label}
            </span>
            {result === 'win' && (
                <span className="text-sm">
                    +{fight.reward} points · {fight.trophiesAfter} 🏆 · streak {fight.streakAfter}
                </span>
            )}
            {result === 'draw' && (
                <span className="text-sm">+{fight.reward} points · {fight.trophiesAfter} 🏆</span>
            )}
            {result === 'loss' && (
                <span className="text-sm opacity-70">No reward · {fight.trophiesAfter} 🏆</span>
            )}
            <span className="text-xs opacity-60">Points remaining: {fight.pointsRemaining}</span>
            <button onClick={onClose} className="mt-1 rounded-xl px-4 py-1 border">
                Close
            </button>
        </div>
    )
}
