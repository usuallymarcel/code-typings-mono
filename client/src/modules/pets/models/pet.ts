export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export type BehaviorId = string

export interface PetSpecial {
    id: string
    name: string
    description: string
    tier: number
    magnitude: number
}

export interface PetSpecies {
    speciesId: string
    displayName: string
    rarity: Rarity
    width: number
    height: number
    hitboxInset?: { x: number, y: number }
    defaultSpeed: number
    behaviorBag: BehaviorId[]
    behaviorWeights?: Partial<Record<BehaviorId, number>>
    animations: Record<BehaviorId, AnimationConfig>
    spriteSheets: Record<BehaviorId, string>
    soundCues?: Partial<Record<BehaviorId, string>>
    baseAttack: number
    baseHealth: number
    special: PetSpecial | null
}

export interface AnimationConfig {
    frameWidth: number
    frameHeight: number
    frames: number
    fps: number
    loop?: boolean
}

export interface PetInstance {
    instanceId: string
    speciesId: string
    nickname?: string
    unlockedAt: string
    active: boolean
    level: number
    xp: number
}

export interface RunTimePet {
    instanceId: string
    species: PetSpecies
    x: number
    y: number
    vx: number
    vy: number
    targetVx: number
    targetVy: number
    direction: 1 | -1
    currentBehavior: BehaviorId
    behaviorTimer: number
    targetX?: number
    targetY?: number
    element?: HTMLDivElement

    _animationState?: { frame: number; timer: number; behavior: string; lastUrl?: string}
    _lockedBehavior?: boolean
    _heldByUser?: boolean
}

export interface SpeciesEntry extends PetSpecies {
    owned: boolean
    previewUrl?: string
}

export interface LootboxSummary {
    sku: string
    name: string
    price: string
    odds: Record<Rarity, number>
}

export interface LootboxOpenResult {
    ok: true
    rolled: {
        rarity: Rarity
        speciesId: string
        instanceId: string
        spriteSheets: Record<BehaviorId, string>
    }
    pointsRemaining: string
}
