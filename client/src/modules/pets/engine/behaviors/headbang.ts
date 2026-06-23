import { registerBehavior } from '../behavior/behaviorRegistry'

// Plants its feet and headbangs. All the motion is in the headbang.png frames
// (the top of the body whips up and down); position stays put.
registerBehavior({
    id: 'headbang',
    minDurationMs: 2000, maxDurationMs: 4500,
    enter(pet) { pet.targetVx = 0; pet.targetVy = 0 },
    update() {},
})
