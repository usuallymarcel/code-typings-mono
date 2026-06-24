import { useEffect, useMemo, useRef, useState } from 'react'
import { useModal } from '../../../components/modal/ModalContext'
import { RARITY_COLOR } from './rarity'
import type { LootboxOpenResult, Rarity, SpeciesEntry } from '../models/pet'
import { serverUrl } from '../../../utils/env'

const TILE = 96            // px per reel tile (incl. gap)
const VISIBLE = 5          // tiles visible in the window → window width = 480px
const REEL_LEN = 80        // total tiles on the strip
const WINNER_AT = REEL_LEN - 5   // land near the end so it scrolls a long way
const SPIN_MS = 15200

type Decoy = { img: string; rarity: Rarity}

export function LootboxRevealModal({
    result, species,
}: { result: LootboxOpenResult; species: SpeciesEntry[] }) {
    const { rarity, speciesId, spriteSheets } = result.rolled
    const { closeModal } = useModal()
    const [done, setDone] = useState(false)
    const stripRef = useRef<HTMLDivElement>(null)

    const winnerImg = `${serverUrl}${spriteSheets.idle ?? Object.values(spriteSheets)[0] ?? `/pet-assets/_silhouettes/${speciesId}.png`}`

    const winnerName = species.find(s => s.speciesId === speciesId)?.displayName ?? speciesId

    const decoys = useMemo<Decoy[]>(() => {
        const pool = (result.pool ?? []).map(p => ({
            img: `${serverUrl}${p.previewUrl}`,
            rarity: p.rarity
        }))
        return pool.length ? pool : [{img: winnerImg, rarity}]
    }, [result.pool, winnerImg, rarity])

    const reel = useMemo(() => Array.from({ length: REEL_LEN }, (_, i) => {
        if (i === WINNER_AT) return { img: `${serverUrl}/pet-assets/_silhouettes/${speciesId}.png`, rarity, key: i, winner: true }
        // eslint-disable-next-line react-hooks/purity
        const d = decoys[Math.floor(Math.random() * decoys.length)]

        return { img: d.img, rarity: d.rarity, key: i, winner: false}
    }), [decoys, rarity, speciesId])

    useEffect(() => {
        const urls = new Set<string>([winnerImg, ...decoys.map(d => d.img)])
        urls.forEach(u => { const im = new Image(); im.src = u})
    }, [decoys, winnerImg])

    useEffect(() => {
        const el = stripRef.current
        if (!el) return
        const jitter = (Math.random() - 0.5) * (TILE * 0.5)   // don't always dead-centre
        const offset = (WINNER_AT + 0.5) * TILE - (VISIBLE * TILE) / 2 + jitter

        // Pin the start frame with no transition, then arm the spin on the next
        // frame. The double-rAF guarantees the browser commits translateX(0)
        // before the transition is armed, so it always animates (not snaps).
        el.style.transition = 'none'
        el.style.transform = 'translateX(0px)'
        const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12,.78,.2,1)`
            el.style.transform = `translateX(-${offset}px)`
        }))
        const t = setTimeout(() => setDone(true), SPIN_MS)
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
                                backgroundImage: `url(${t.img})`,
                                backgroundPosition: '0 0', backgroundRepeat: 'no-repeat',
                                opacity: done && !t.winner ? 0.3 : 1,
                                transition: 'opacity 3s',
                                filter: `drop-shadow(0 0 6px ${RARITY_COLOR[t.rarity as keyof typeof RARITY_COLOR] ?? '#555'})`,
                            }} />
                        </div>
                    ))}
                </div>
            </div>

            {done && (
                <>
                    <div style={{ height: 132 }} className="flex items-end justify-center">
                        <div style={{
                            width: 64, height: 64, transform: 'scale(1.9)', transformOrigin: 'bottom center',
                            imageRendering: 'pixelated',
                            backgroundImage: `url(${winnerImg})`,
                            backgroundPosition: '0 0', backgroundRepeat: 'no-repeat',
                            filter: `drop-shadow(0 0 8px ${RARITY_COLOR[rarity]})`,
                        }} />
                    </div>
                    <span className="uppercase tracking-widest font-bold" style={{ color: RARITY_COLOR[rarity] }}>{rarity}</span>
                    <span className="font-semibold">{winnerName}</span>
                    <div className="flex gap-2">
                        <button onClick={() => {
                            closeModal()
                            }} className="rounded-xl px-4 py-1 border">Close</button>
                    </div>
                </>
            )}
        </div>
    )
}