import { registerBehavior } from '../behavior/behaviorRegistry'
registerBehavior({
    id: 'teleport',
    minDurationMs: 1500, maxDurationMs: 3000,
    enter(pet) {
        pet.targetVx = 0; pet.targetVy = 0; pet.vx = 0; pet.vy = 0
        pet.x = Math.random() * (window.innerWidth - pet.species.width)
        pet.y = Math.random() * (window.innerHeight - pet.species.height)
    },
    update() {},
})