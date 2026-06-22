import type { RunTimePet } from '../models/pet'

export function updatePhysics(pet: RunTimePet) {
    if (pet._heldByUser) return        // pickup owns the position
    const { width, height } = pet.species
    pet.vx += (pet.targetVx - pet.vx) * 0.08
    pet.vy += (pet.targetVy - pet.vy) * 0.08
    pet.x += pet.vx
    pet.y += pet.vy
    if (pet.x < 0) { pet.x = 0; pet.targetVx *= -1 }
    if (pet.x > window.innerWidth - width)  { pet.x = window.innerWidth - width;  pet.targetVx *= -1 }
    if (pet.y < 0) { pet.y = 0; pet.targetVy *= -1 }
    if (pet.y > window.innerHeight - height){ pet.y = window.innerHeight - height; pet.targetVy *= -1 }
    if (Math.abs(pet.vx) > 0.1) pet.direction = pet.vx > 0 ? 1 : -1
}