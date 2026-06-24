import { registerBehavior } from '../behavior/behaviorRegistry'

// Buzzes in place — tiny opposing nudges every frame that roughly cancel out, so
// there's almost no net travel, just a frantic shiver. (Distinct from jitter,
// which actually wanders around.)
registerBehavior({
    id: 'vibrate',
    minDurationMs: 1500, maxDurationMs: 3500,
    update(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = (Math.random() * 2 - 1) * s * 0.4
        pet.targetVy = (Math.random() * 2 - 1) * s * 0.4
    },
})
