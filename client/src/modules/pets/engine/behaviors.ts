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

function updateLookAround(pet: Pet) {
    if (Math.random() < 0.02) {
        pet.direction *= -1
    }

    pet.vx *= 0.95
    pet.vy *= 0.95
}

function updateIdle(pet: Pet) {

    if (pet.idle === undefined) {
        pet.idle = {
            timer: 120 + Math.random() * 120,
            state: 'still',
            accumulator: 0
        }
    }

    pet.idle.timer -= 1

    // tiny "breathing drift"
    const t = performance.now()
    pet.vx += Math.sin(t * 0.002) * 0.01
    pet.vy += Math.cos(t * 0.002) * 0.01

    // soften movement
    pet.vx *= 0.92
    pet.vy *= 0.92

    // state change only occasionally (not every frame)
    if (pet.idle.timer > 0) {
        if (pet.idle.state === 'lookAround') {
            updateLookAround(pet)
        }
        return
    }

    const r = Math.random()

    if (r < 0.5) {
        pet.idle.state = 'still'
        pet.idle.timer = 120 + Math.random() * 180
    } 
    else if (r < 0.8) {
        pet.idle.state = 'lookAround'
        pet.idle.timer = 60 + Math.random() * 120
    } 
    else {
        pet.behavior = 'walk'
        pet.animation = 'walk'

        // reset idle state
        pet.idle = undefined
    }
}

function updateWalk(pet: Pet) {
    if (pet.vx === 0) {
        pet.vx = Math.random() > 0.5 ? pet.speed : -pet.speed
    }

    if (pet.vy === 0) {
        pet.vy = Math.random() > 0.5 ? pet.speed : -pet.speed
    }

    if (Math.random() < 0.01) {
        pet.behavior = 'idle'
        pet.animation = 'idle'

        // smooth stop
        pet.vx *= 0.3
        pet.vy *= 0.3

        pet.idle = undefined
    }
}

function updateFollow(pet: Pet) {
    if (!pet.targetX) return

    const dx = pet.targetX - pet.x

    const targetVx = Math.sign(dx) * pet.speed

    pet.vx += (targetVx - pet.vx) * 0.1
}