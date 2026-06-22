import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'idle',
    minDurationMs: 2500, maxDurationMs: 5000,
    enter(pet) { pet.targetVx = 0; pet.targetVy = 0 },
    update() {},
})