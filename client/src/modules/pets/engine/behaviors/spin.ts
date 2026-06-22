import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'spin',
    minDurationMs: 4000, maxDurationMs: 9000,
    update(pet, dt) {
        if (Math.random() < 0.003 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s * 0.4
        }
    },
})