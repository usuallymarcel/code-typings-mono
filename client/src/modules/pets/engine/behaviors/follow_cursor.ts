import { registerBehavior } from '../behavior/behaviorRegistry'
import { cursor } from './_cursor'
registerBehavior({
    id: 'follow_cursor',
    minDurationMs: 6000, maxDurationMs: 12000,
    update(pet) {
        const dx = cursor.x - (pet.x + pet.species.width / 2)
        const dy = cursor.y - (pet.y + pet.species.height / 2)
        const d = Math.hypot(dx, dy)
        if (d < 40) { pet.targetVx = pet.targetVy = 0; return }
        const s = pet.species.defaultSpeed
        pet.targetVx = (dx / d) * s
        pet.targetVy = (dy / d) * s
    },
})