import type { CSSProperties } from 'react'
import type { SpeciesEntry } from '../models/pet'
import { serverUrl } from '../../../utils/env'
import { RARITY_COLOR } from './rarity'
import styles from './battle.module.css'

export type Flyout = { id: number; text: string; kind: 'dmg' | 'heal' | 'buff' | 'ability' }

const FLYOUT_COLOR: Record<Flyout['kind'], string> = {
    dmg: '#f87171',
    heal: '#4ade80',
    buff: '#fbbf24',
    ability: '#e5e7eb',
}

function spriteStyle(meta: SpeciesEntry | undefined, w: number, h: number, scale: number): CSSProperties {
    const anim = meta?.animations?.idle
    const sheet = meta?.spriteSheets?.idle
    const base: CSSProperties = {
        width: w,
        height: h,
        imageRendering: 'pixelated',
        backgroundRepeat: 'no-repeat',
    }
    if (sheet && anim) {
        // horizontal strip — show frame 0 by scaling the whole sheet and pinning to the left
        return {
            ...base,
            backgroundImage: `url(${serverUrl}${sheet})`,
            backgroundSize: `${anim.frameWidth * anim.frames * scale}px ${anim.frameHeight * scale}px`,
            backgroundPosition: '0 0',
        }
    }
    if (meta?.previewUrl) {
        // not owned (enemies) → render the silhouette as a shadowy stand-in
        return {
            ...base,
            backgroundImage: `url(${serverUrl}${meta.previewUrl})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            opacity: 0.9,
        }
    }
    return { ...base, background: '#3f3f46', borderRadius: 6 }
}

export function PetPortrait({
    meta,
    scale = 1,
    facing = 'right',
    fainting = false,
    attack,
    health,
    maxHealth,
    level,
    name,
    showBar = false,
    flyout,
    onClick
}: {
    meta: SpeciesEntry | undefined
    scale?: number
    facing?: 'left' | 'right'
    fainting?: boolean
    attack?: number
    health?: number
    maxHealth?: number
    level?: number
    name?: string
    showBar?: boolean
    flyout?: Flyout | null
    onClick?: () => void
}) {
    const frameW = meta?.animations?.idle?.frameWidth ?? meta?.width ?? 48
    const frameH = meta?.animations?.idle?.frameHeight ?? meta?.height ?? 48
    const w = frameW * scale
    const h = frameH * scale

    const hpRatio = maxHealth && maxHealth > 0 ? Math.max(0, Math.min(1, (health ?? 0) / maxHealth)) : 1
    const hpColor = hpRatio > 0.5 ? '#4ade80' : hpRatio > 0.25 ? '#fbbf24' : '#f87171'

    return (
        <div className="relative flex flex-col cursor-pointer items-center" style={{ width: w }} onClick={onClick}>
            <div className="relative flex items-end justify-center" style={{ width: w, height: h }}>
                {flyout && (
                    <div key={flyout.id} className={styles.flyout} style={{ color: FLYOUT_COLOR[flyout.kind] }}>
                        {flyout.text}
                    </div>
                )}

                {level != null && level > 1 && (
                    <span className="absolute top-1 -left-1 rounded-full bg-amber-500 text-black text-[9px] font-bold px-1 leading-tight">
                        L{level}
                    </span>
                )}

                <div style={{ transform: facing === 'left' ? 'scaleX(-1)' : undefined }}>
                    <div className={fainting ? styles.faint : ''} style={spriteStyle(meta, w, h, scale)} />
                </div>
            </div>

            {showBar && (
                <div className="mt-1 h-1.5 w-full rounded-full overflow-hidden bg-black/40">
                    <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${hpRatio * 100}%`, background: hpColor }} />
                </div>
            )}

            {(attack != null || health != null) && (
                <div className="mt-1 flex items-center gap-1 text-xs font-bold tabular-nums">
                    {attack != null && <span className="text-orange-400">⚔{attack}</span>}
                    {health != null && <span style={{ color: hpColor }}>❤{Math.max(0, health)}</span>}
                </div>
            )}

            {name && (
                <span className="mt-0.5 max-w-full truncate text-[10px]" style={{ color: meta ? RARITY_COLOR[meta.rarity] : undefined }}>
                    {name}
                </span>
            )}
        </div>
    )
}
