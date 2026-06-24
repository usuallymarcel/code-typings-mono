import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'recoil',
    minDurationMs: 700, maxDurationMs: 1400,
    enter(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = -pet.direction * s * 6   // shove opposite of facing
        pet.targetVy = 0
    },
    update(pet) { pet.targetVx *= 0.85 },       // decay the kick
    exit(pet) { pet.targetVx = 0 },
})