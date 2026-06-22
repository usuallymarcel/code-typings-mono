import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'wander',
    minDurationMs: 3000, maxDurationMs: 8000,
    update(pet, dt) {
        if (Math.random() < 0.002 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s
            pet.targetVy = (Math.random() * 2 - 1) * s * 0.3
        }
    },
})