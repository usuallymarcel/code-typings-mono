import { registerBehavior } from '../behavior/behaviorRegistry'

// Commits to a direction and BOLTS across the screen, occasionally changing its
// mind mid-sprint. Physics smooth-stops it at the walls. Pure chaotic energy.
registerBehavior({
    id: 'zoomies',
    minDurationMs: 1200, maxDurationMs: 2600,
    enter(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = (Math.random() < 0.5 ? -1 : 1) * s * 8
        pet.targetVy = (Math.random() * 2 - 1) * s * 1.5
    },
    update(pet, dt) {
        if (Math.random() < 0.02 * dt / 16.6) {
            const s = pet.species.defaultSpeed
            pet.targetVx = (Math.random() < 0.5 ? -1 : 1) * s * 8
        }
    },
    exit(pet) { pet.targetVx = 0; pet.targetVy = 0 },
})
