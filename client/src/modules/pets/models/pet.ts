export type BehaviorTypes = 'idle' | 'walk' | 'follow' | 'sleep'

export type PetBehavior = Array<BehaviorTypes>

// export type PetAnimation = 'idle' | 'walk'

export interface Pet {
    id: string

    x: number
    y: number

    vx: number
    vy: number

    targetVx: number
    targetVy: number

    width: number
    height: number

    direction: 1 | -1

    behaviorTimer?: number
    currentBehavior: BehaviorTypes
    behaviors: PetBehavior
    // animation: PetAnimation

    speed: number

    targetX?: number
    targetY?: number

    element?: HTMLDivElement

    _animationState?: { frame: number, timer: number }

}
