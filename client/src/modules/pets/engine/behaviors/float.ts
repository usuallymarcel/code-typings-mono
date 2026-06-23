import { registerBehavior } from '../behavior/behaviorRegistry'

// Ghostly drift that ignores the "stay near the floor" instinct — it roams
// vertically too. The float.png sheet adds the gentle bob; this just nudges a
// new lazy drift direction every so often.
registerBehavior({
    id: 'float',
    minDurationMs: 5000, maxDurationMs: 11000,
    update(pet, dt) {
        if (Math.random() < 0.01 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() * 2 - 1) * s * 0.6
            pet.targetVy = (Math.random() * 2 - 1) * s * 0.6
        }
    },
})
