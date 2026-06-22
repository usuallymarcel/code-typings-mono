import type { RunTimePet } from '../models/pet'

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

export function resolvePetCollision(a: RunTimePet, b: RunTimePet) {
    if (
        !isColliding(
            {
                x: a.x,
                y: a.y,
                width: a.species.width,
                height: a.species.height,
            },
            {
                x: b.x,
                y: b.y,
                width: b.species.width,
                height: b.species.height,
            }
        )
    ) {
        return
    }

    // Push pets apart
    const overlapX =
        Math.min(a.x + a.species.width, b.x + b.species.width) -
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

export function resolveScreenBounds(pet: RunTimePet) {
    if (pet.x < 0) {
        pet.x = 0
        pet.vx *= -1
    }

    if (pet.x + pet.species.width > window.innerWidth) {
        pet.x = window.innerWidth - pet.species.width
        pet.vx *= -1
    }

    if (pet.y < 0) {
        pet.y = 0
        pet.vy *= -1
    }

    if (pet.y + pet.species.height > window.innerHeight) {
        pet.y = window.innerHeight - pet.species.height
        pet.vy *= -1
    }
}