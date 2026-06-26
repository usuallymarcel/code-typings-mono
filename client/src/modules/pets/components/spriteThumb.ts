// client/src/modules/pets/components/spriteThumb.ts
import { serverUrl } from '../../../utils/env'
import type { SpeciesEntry } from '../models/pet'

// Resolve the frame-0 sprite-sheet URL for a species the player owns,
// otherwise its silhouette preview. Returns undefined if neither exists.
export function spriteThumbUrl(species?: SpeciesEntry): string | undefined {
    if (!species) return undefined

    if (species.owned && species.spriteSheets) {
        const sheet = species.spriteSheets.idle
            ?? Object.values(species.spriteSheets)[0]
        if (sheet) return `${serverUrl}${sheet}`
    }

    if (species.previewUrl) {
        return `${serverUrl}${species.previewUrl}`
    }

    return undefined
}

// Inline style for a 64x64 frame-0 tile (pixel-art, top-left frame).
export function spriteThumbStyle(
    url: string | undefined,
    size = 64,
): React.CSSProperties {
    return {
        width: size,
        height: size,
        imageRendering: 'pixelated',
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundPosition: '0 0',
        backgroundRepeat: 'no-repeat',
    }
}
