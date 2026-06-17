import type { RunTimePet } from "../../models/pet"

export interface BehaviorDefinition { 
    id: string
    enter?: (pet: RunTimePet) => void
    update: (pet: RunTimePet, deltaTime: number) => void
    exit?: (pet: RunTimePet) => void
    minDurationMs?: number
    maxDurationMs?: number
}

const registry = new Map<string, BehaviorDefinition>()

export const registerBehavior = (b: BehaviorDefinition) => {
    registry.set(b.id, b)
}

export const getBehavior = (id: string) => {
    return registry.get(id)
}

export const allBehaviors = () => {
    return [...registry.values()]
}