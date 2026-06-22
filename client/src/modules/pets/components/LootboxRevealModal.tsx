import { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../../../components/modal/ModalContext'
import { usePetInventory } from '../hooks/usePetInventory'
import { RARITY_COLOR } from './rarity'
import type { LootboxOpenResult, SpeciesEntry } from '../models/pet'
import { serverUrl } from '../../../utils/env'

const TILE = 96            // px per reel tile (incl. gap)
const VISIBLE = 5          // tiles visible in the window → window width = 480px
const REEL_LEN = 48        // total tiles on the strip
const WINNER_AT = REEL_LEN - 5   // land near the end so it scrolls a long way
const SPIN_MS = 8200

function thumb(s?: SpeciesEntry): string | undefined {
    if (!s) return undefined
    return `${serverUrl}${s.previewUrl}`
}

export function LootboxRevealModal({
    result, species,
}: { result: LootboxOpenResult; species: SpeciesEntry[] }) {
    const { rarity, speciesId, spriteSheets } = result.rolled
    const { closeModal } = useModal()
    const [done, setDone] = useState(false)
    const stripRef = useRef<HTMLDivElement>(null)

    const winnerImg = spriteSheets.idle ?? Object.values(spriteSheets)[0]
    const winnerName = species.find(s => s.speciesId === speciesId)?.displayName ?? speciesId

    // Build the reel once: random decoys, real winner pinned at WINNER_AT.
    const reel = useMemo(() => Array.from({ length: REEL_LEN }, (_, i) => {
        if (i === WINNER_AT) return { img: `${serverUrl}${winnerImg}`, rarity, key: i }
        const s = species.length ? species[Math.floor(Math.random() * species.length)] : undefined
        return { img: thumb(s), rarity: s?.rarity ?? 'common', key: i }
    }), [species, winnerImg, rarity])

    // Animate: start at 0, then transition to the offset that centres WINNER_AT.
    useEffect(() => {
        const el = stripRef.current
        if (!el) return
        const jitter = (Math.random() - 0.5) * (TILE * 0.5)   // don't always dead-centre
        const offset = (WINNER_AT + 0.5) * TILE - (VISIBLE * TILE) / 2 + jitter
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

        el.style.transform = 'translateX(0px)'
        el.style.transition = reduce ? 'none' : `transform ${SPIN_MS}ms cubic-bezier(.12,.78,.2,1)`
        const raf = requestAnimationFrame(() => { el.style.transform = `translateX(-${offset}px)` })
        const t = setTimeout(() => setDone(true), reduce ? 0 : SPIN_MS)
        return () => { cancelAnimationFrame(raf); clearTimeout(t) }
    }, [])

    return (
        <div className="flex flex-col items-center gap-4 p-6 rounded-xl [background:var(--bg)]"
             style={{ boxShadow: done ? `0 0 48px ${RARITY_COLOR[rarity]}` : undefined, transition: 'box-shadow .3s' }}>
            {/* reel window with a centre marker */}
            <div className="relative overflow-hidden border rounded-lg"
                 style={{ width: VISIBLE * TILE, height: TILE }}>
                <div className="absolute left-1/2 top-0 bottom-0 z-10 -translate-x-1/2"
                     style={{ width: 2, background: RARITY_COLOR[rarity] }} />
                <div ref={stripRef} className="flex h-full" style={{ willChange: 'transform' }}>
                    {reel.map(t => (
                        <div key={t.key} className="shrink-0 flex items-center justify-center"
                             style={{ width: TILE, height: TILE }}>
                            <div style={{
                                width: 64, height: 64, imageRendering: 'pixelated',
                                backgroundImage: t.img ? `url(${t.img})` : undefined,
                                backgroundPosition: '0 0', backgroundRepeat: 'no-repeat',
                                filter: `drop-shadow(0 0 6px ${RARITY_COLOR[t.rarity as keyof typeof RARITY_COLOR] ?? '#555'})`,
                            }} />
                        </div>
                    ))}
                </div>
            </div>

            {done && (
                <>
                    <span className="uppercase tracking-widest font-bold" style={{ color: RARITY_COLOR[rarity] }}>{rarity}</span>
                    <span className="font-semibold">{winnerName}</span>
                    <div className="flex gap-2">
                        <button onClick={closeModal} className="rounded-xl px-4 py-1 border">Close</button>
                    </div>
                </>
            )}
        </div>
    )
}