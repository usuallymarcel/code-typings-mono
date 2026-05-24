import type { Pet } from '../models/pet'

export function updateBehavior(pet: Pet) {
    switch(pet.behavior) {
        case 'idle':
            updateIdle(pet)
            break
        case 'walk':
            updateWalk(pet)
            break
        case 'follow':
            updateFollow(pet)
            break
    }
}

function updateIdle(pet: Pet) {
    pet.vx *= 0.9

    if(Math.random() < 0.01) {
        pet.behavior = 'walk'
        pet.animation = 'walk'
    }
}

function updateWalk(pet: Pet) {
    if(pet.vx === 0) {
        pet.vx = Math.random() > 0.5 ? pet.speed : -pet.speed
    }

    if(pet.vy === 0) {
        pet.vy = Math.random() > 0.5 ? pet.speed : -pet.speed
    }

    if(Math.random() < 0.1) {
        pet.behavior = 'idle'
        pet.animation = 'idle'
        pet.vx = 0
    }
}

function updateFollow(pet: Pet) {
    if(!pet.targetX) return

    const dx = pet.targetX - pet.x

    pet.vx = Math.sign(dx) * pet.speed
}