import { registerBehavior } from '../behavior/behaviorRegistry'
import { cursor } from './_cursor'
registerBehavior({
    id: 'flee_cursor',
    minDurationMs: 3000, maxDurationMs: 7000,
    update(pet) {
        const dx = (pet.x + pet.species.width / 2) - cursor.x
        const dy = (pet.y + pet.species.height / 2) - cursor.y
        const d = Math.hypot(dx, dy) || 1
        const s = pet.species.defaultSpeed
        if (d > 350) { pet.targetVx = pet.targetVy = 0; return }  // safe → chill
        pet.targetVx = (dx / d) * s * 1.4
        pet.targetVy = (dy / d) * s * 0.6
    },
})