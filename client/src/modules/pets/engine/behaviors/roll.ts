import { registerBehavior } from '../behavior/behaviorRegistry'

// Picks a direction and rolls steadily along the floor. The roll.png sheet fakes
// the rotation (horizontal squash), so all this has to do is keep it moving.
registerBehavior({
    id: 'roll',
    minDurationMs: 2500, maxDurationMs: 6000,
    enter(pet) {
        const s = pet.species.defaultSpeed
        pet.targetVx = (Math.random() < 0.5 ? -1 : 1) * s * 2.5
        pet.targetVy = 0
    },
    update() {},
    exit(pet) { pet.targetVx = 0 },
})
