import { registerBehavior } from '../behavior/behaviorRegistry'
import { cursor } from './_cursor'

// Circles the cursor like a little moon. The target point rides around a ring
// centred on the cursor; the pet just steers toward wherever the ring is now.
registerBehavior({
    id: 'orbit',
    minDurationMs: 4000, maxDurationMs: 9000,
    update(pet) {
        const t = performance.now() / 600
        const R = 130
        const tx = cursor.x + Math.cos(t) * R
        const ty = cursor.y + Math.sin(t) * R
        const dx = tx - (pet.x + pet.species.width / 2)
        const dy = ty - (pet.y + pet.species.height / 2)
        const d = Math.hypot(dx, dy) || 1
        const s = pet.species.defaultSpeed
        pet.targetVx = (dx / d) * s * 1.4
        pet.targetVy = (dy / d) * s * 1.4
    },
})
