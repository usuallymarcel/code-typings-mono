import type { Pet } from '../models/pet'

export type CollisionBox = {
    x: number
    y: number
    width: number
    height: number
}

export function isColliding(a: CollisionBox, b: CollisionBox) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

export function resolvePetCollision(a: Pet, b: Pet) {
    if (
        !isColliding(
            {
                x: a.x,
                y: a.y,
                width: a.width,
                height: a.height,
            },
            {
                x: b.x,
                y: b.y,
                width: b.width,
                height: b.height,
            }
        )
    ) {
        return
    }

    // Push pets apart
    const overlapX =
        Math.min(a.x + a.width, b.x + b.width) -
        Math.max(a.x, b.x)

    if (a.x < b.x) {
        a.x -= overlapX / 2
        b.x += overlapX / 2
    } else {
        a.x += overlapX / 2
        b.x -= overlapX / 2
    }

    // Reverse direction
    a.vx *= -1
    b.vx *= -1

    a.direction = a.vx >= 0 ? 1 : -1
    b.direction = b.vx >= 0 ? 1 : -1
}

export function resolveScreenBounds(pet: Pet) {
    if (pet.x < 0) {
        pet.x = 0
        pet.vx *= -1
    }

    if (pet.x + pet.width > window.innerWidth) {
        pet.x = window.innerWidth - pet.width
        pet.vx *= -1
    }

    if (pet.y < 0) {
        pet.y = 0
        pet.vy *= -1
    }

    if (pet.y + pet.height > window.innerHeight) {
        pet.y = window.innerHeight - pet.height
        pet.vy *= -1
    }
}