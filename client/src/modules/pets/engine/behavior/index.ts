import type { PetSpecies, RunTimePet } from "../../models/pet"
import { getBehavior } from "./behaviorRegistry"
import "../behaviors"

export function updateBehavior(pet: RunTimePet, deltaTime: number) {
    pet.behaviorTimer -= deltaTime

    if (pet.behaviorTimer <= 0) {
        const old = getBehavior(pet.currentBehavior)
        old?.exit?.(pet)

        pet.currentBehavior = pickWeighted(pet.species)
        const next = getBehavior(pet.currentBehavior)
        next?.enter?.(pet)
        
        const min = next?.minDurationMs ?? 4000
        const max = next?.maxDurationMs ?? 7000

        pet.behaviorTimer = min + Math.random() * (max-min)


    }
    getBehavior(pet.currentBehavior)?.update(pet, deltaTime)
}

function pickWeighted(species: PetSpecies) {
    const bag = species.behaviorBag
    const weights = species.behaviorWeights ?? {}

    const entries = bag.map(id => [id, weights[id] ?? 1] as const)
    const total = entries.reduce((sum, [, w]) => sum + w, 0)
    if (total <=0) return bag[0]

    let r = Math.random() * total

    for (const [id, w] of entries) {
        r -= w
        if (r <= 0) return id
    }
    return bag[bag.length - 1]

}
