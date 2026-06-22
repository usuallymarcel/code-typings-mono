import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'jitter',
    minDurationMs: 1500, maxDurationMs: 3500,
    update(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = (Math.random() * 2 - 1) * s * 1.5
        pet.targetVy = (Math.random() * 2 - 1) * s * 0.5
    },
})