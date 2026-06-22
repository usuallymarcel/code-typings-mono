import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'sleep',
    minDurationMs: 5000, maxDurationMs: 12000,
    enter(pet) { pet.targetVx = 0; pet.targetVy = 0 },
    update() {},
})