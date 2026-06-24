import { registerBehavior } from '../behavior/behaviorRegistry'

// Hangs around doing occasional flips. The backflip.png sheet does the actual
// somersault (hop arc + fake rotation); here we just hop it sideways now and then
// so the flips travel a bit.
registerBehavior({
    id: 'backflip',
    minDurationMs: 2500, maxDurationMs: 5000,
    update(pet, dt) {
        if (Math.random() < 0.008 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s * 2
        }
    },
})
