import type { Pet } from '../models/pet'

export function updatePhysics(pet: Pet) {
    pet.x += pet.vx
    pet.y += pet.vy

    if(pet.x < 0) {
        pet.x = 0
        pet.vx *= -1
    }

    if(pet.x > window.innerWidth - pet.width) {
        pet.x = window.innerWidth - pet.width
        pet.vx *= -1
    }

    pet.direction = pet.vx >= 0 ? 1 : -1
}