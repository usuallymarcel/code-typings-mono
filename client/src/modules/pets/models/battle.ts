import type { Rarity } from './pet'

// ---- Teams (shape of /battle/teams + /battle/team) --------------------------

export interface BattleTeamMember {
    instanceId: string
    speciesId: string
    nickname: string | null
    level: number
    slot: number
}

export interface BattleTeam {
    id: number
    name: string
    trophies: number
    wins: number
    losses: number
    streak: number
    bestStreak: number
    members: BattleTeamMember[]
}

// ---- Fight replay (shape of /battle/fight/{team_id}) ------------------------
// The server runs the whole sim and hands us an ordered event list to replay.
// A pet's special is serialized from a python NamedTuple, so it arrives as a
// tuple: [id, name, description, magnitude]. We don't lean on it in the UI.

export type BattleSpecial = readonly [id: string, name: string, description: string, magnitude: number]

export interface PetSnapshot {
    instanceId: string | null
    speciesId: string
    name: string
    rarity: Rarity
    attack: number
    health: number
    maxHealth: number
    level: number
    special: BattleSpecial | null
}

export type Side = 'player' | 'enemy'

export type BattleEffect =
    | { type: 'damage'; side: Side; index: number; amount: number }
    | { type: 'heal'; side: Side; index: number; amount: number }
    | { type: 'stat_change'; side: Side; index: number; dHealth?: number; dAttack?: number }

export type BattleEvent =
    | { type: 'start'; player: PetSnapshot[]; enemy: PetSnapshot[] }
    | { type: 'ability'; side: Side; sourceIndex: number; abilityId: string; abilityName: string; effects: BattleEffect[]; note?: string }
    | { type: 'attack'; playerDamage: number; enemyDamage: number; playerHealthAfter: number; enemyHealthAfter: number }
    | { type: 'faint'; side: Side; index: number }
    | { type: 'end'; result: BattleResult }

export type BattleResult = 'win' | 'loss' | 'draw'

export interface FightResult {
    ok: true
    result: BattleResult
    reward: number
    trophiesAfter: number
    streakAfter: number
    pointsRemaining: number
    playerTeam: PetSnapshot[]
    enemyTeam: PetSnapshot[]
    events: BattleEvent[]
}
