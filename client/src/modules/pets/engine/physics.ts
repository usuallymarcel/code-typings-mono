import type { Pet } from '../models/pet'

export function updatePhysics(pet: Pet) {
    // smooth acceleration
    pet.vx += (pet.targetVx - pet.vx) * 0.08
    pet.vy += (pet.targetVy - pet.vy) * 0.08

    pet.x += pet.vx
    pet.y += pet.vy

    // bounce horizontally
    if (pet.x < 0) {
        pet.x = 0
        pet.targetVx *= -1
    }

    if (pet.x > window.innerWidth - pet.width) {
        pet.x = window.innerWidth - pet.width
        pet.targetVx *= -1
    }

    // bounce vertically
    if (pet.y < 0) {
        pet.y = 0
        pet.targetVy *= -1
    }

    if (pet.y > window.innerHeight - pet.height) {
        pet.y = window.innerHeight - pet.height
        pet.targetVy *= -1
    }

    // facing
    if (Math.abs(pet.vx) > 0.1) {
        pet.direction = pet.vx > 0 ? 1 : -1
    }
}