// client/src/modules/pets/models/battle.ts
import type { Rarity } from './pet'

export type BattleSide = 'player' | 'enemy'

export type BattleResult = 'win' | 'loss' | 'draw'

// The ability shown on a snapshot is the trimmed catalog descriptor (no tier/magnitude).
export interface SnapshotSpecial {
    id: string
    name: string
    description: string
}

// Mirror of the server PetSnapshot. `instanceId` is null for summoned tokens.
export interface PetSnapshot {
    instanceId: string | null
    speciesId: string
    displayName: string
    rarity: Rarity
    attack: number
    health: number
    maxHealth: number
    level: number
    special: SnapshotSpecial | null
    isToken?: boolean
}

// A single stat change applied to one pet at a given line index AT THE TIME of the event.
export interface BattleEffect {
    side: BattleSide
    index: number
    dHealth?: number
    dAttack?: number
}

// --- Discriminated union on `type`, exact mirror of the server event log ---

export interface StartEvent {
    type: 'start'
    player: PetSnapshot[]
    enemy: PetSnapshot[]
}

export interface AbilityEvent {
    type: 'ability'
    side: BattleSide
    sourceIndex: number
    abilityId: string
    abilityName: string
    effects: BattleEffect[]
    note?: string
}

export interface AttackEvent {
    type: 'attack'
    playerDamage: number
    enemyDamage: number
    playerHealthAfter: number
    enemyHealthAfter: number
}

export interface FaintEvent {
    type: 'faint'
    side: BattleSide
    index: number
}

export interface SummonEvent {
    type: 'summon'
    side: BattleSide
    index: number
    pet: PetSnapshot
}

export interface EndEvent {
    type: 'end'
    result: BattleResult
}

export type BattleEvent =
    | StartEvent
    | AbilityEvent
    | AttackEvent
    | FaintEvent
    | SummonEvent
    | EndEvent

// --- Profile / team / response envelopes ---

export interface BattleProfile {
    trophies: number
    wins: number
    losses: number
    streak: number
    bestStreak: number
}

// A saved-team pet resolved to a live instance with computed battle stats.
export interface TeamPet {
    instanceId: string
    speciesId: string
    displayName: string
    rarity: Rarity
    attack: number
    health: number
    level: number
    special: SnapshotSpecial | null
}

// GET /battle/profile and POST /battle/team both return this shape.
export interface ProfileResponse {
    ok: boolean
    profile: BattleProfile
    team: TeamPet[]
}

// POST /battle/fight
export interface FightResponse {
    ok: boolean
    result: BattleResult
    reward: number
    trophiesAfter: number
    streakAfter: number
    pointsRemaining: number
    playerTeam: PetSnapshot[]
    enemyTeam: PetSnapshot[]
    events: BattleEvent[]
}

// POST /pets/merge -> updated target instance, nested under `target`
// (matches the server route, which returns { ok, target: { ... } }).
export interface MergeResponse {
    ok: boolean
    target: {
        instanceId: string
        speciesId: string
        level: number
        xp: number
        attack: number
        health: number
    }
}
