import type { Pet } from '../models/pet'

function randomFloat(min: number, max: number) {
    return Math.random() * (max - min) + min
}

export function updateBehavior(pet: Pet, deltaTime: number) {
    if (pet.behaviorTimer === undefined) {
        chooseBehavior(pet)
    }

    pet.behaviorTimer! -= deltaTime

    if (pet.behaviorTimer! <= 0) {
        chooseBehavior(pet)
    }

    switch (pet.currentBehavior) {
        case 'walk':
            walk(pet)
            break
        case 'idle':
            idle(pet)
            break
        case 'follow':
            follow(pet)
            break
        case 'sleep':
            sleep(pet)
            break
    }
}

function chooseBehavior(pet: Pet) {
    pet.currentBehavior = pet.behaviors[Math.floor(Math.random() * pet.behaviors.length)]

    pet.behaviorTimer = 5000 + Math.random() * 1240
}

function idle(pet: Pet) {
    pet.targetVx = 0
    pet.targetVy = 0

    // tiny random movement
    if (Math.random() < 0.005) {
        pet.targetVx = randomFloat(-0.5, 0.5)
        pet.targetVy = randomFloat(-0.5, 0.5)
    }
}

function walk(pet: Pet) {
    if (Math.random() < 0.002) {
        pet.targetVx = randomFloat(-pet.speed, pet.speed)
        pet.targetVy = randomFloat(-pet.speed, pet.speed)
    }
}

function follow(pet: Pet) {
    if (pet.targetX === undefined || pet.targetY === undefined) {
        chooseBehavior(pet)
        return
    }

    const dx = pet.targetX - pet.x
    const dy = pet.targetY - pet.y

    const distance = Math.hypot(dx, dy)

    if (distance < 10) {
        pet.targetVx = 0
        pet.targetVy = 0
        return
    }

    pet.targetVx = (dx / distance) * pet.speed
    pet.targetVy = (dy / distance) * pet.speed
}

function sleep(pet: Pet) {
    pet.vx = 0
    pet.vy = 0
}