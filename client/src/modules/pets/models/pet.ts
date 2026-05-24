export type PetBehavior = 'idle' | 'walk' | 'follow' | 'sleep'

export type PetAnimation = 'idle' | 'walk'

type IdleState = 'still' | 'lookAround'

interface IdleProperties {
    state: IdleState
    timer: number
    accumulator: number
}

export interface Pet {
    id: string

    x: number
    y: number

    vx: number
    vy: number

    width: number
    height: number

    direction: 1 | -1

    behavior: PetBehavior
    animation: PetAnimation

    speed: number

    targetX?: number
    targetY?: number

    element?: HTMLDivElement

    _animationState?: { frame: number, timer: number }

    idle?: IdleProperties

    sprite?: string
}
