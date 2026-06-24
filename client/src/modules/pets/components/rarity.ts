import type { Rarity } from '../models/pet'

export const RARITY_COLOR: Record<Rarity, string> = {
    common:    '#9ca3af',  // gray-400
    uncommon:  '#22c55e',  // green-500
    rare:      '#3b82f6',  // blue-500
    epic:      '#a855f7',  // purple-500
    legendary: '#f59e0b',  // amber-500
}