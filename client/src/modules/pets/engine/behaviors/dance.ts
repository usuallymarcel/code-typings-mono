import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'dance',
    minDurationMs: 2000, maxDurationMs: 4000,
    enter(pet) { pet.targetVx = 0; pet.targetVy = 0 },
    update() {},   // motion is purely in the dance.png frames
})