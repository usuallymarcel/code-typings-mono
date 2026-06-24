import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'hop',
    minDurationMs: 2500, maxDurationMs: 5000,
    update(pet, dt) {
        if (Math.random() < 0.01 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s * 3
        }
    },
})