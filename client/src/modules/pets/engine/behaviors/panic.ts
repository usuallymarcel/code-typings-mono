import { registerBehavior } from '../behavior/behaviorRegistry'

// Full meltdown: re-rolls a fast random heading every single frame, so it darts
// around erratically with no plan whatsoever. (Unlike zoomies, which at least
// commits to a direction for a while.)
registerBehavior({
    id: 'panic',
    minDurationMs: 1500, maxDurationMs: 4000,
    update(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = (Math.random() * 2 - 1) * s * 4
        pet.targetVy = (Math.random() * 2 - 1) * s * 1.2
    },
})
