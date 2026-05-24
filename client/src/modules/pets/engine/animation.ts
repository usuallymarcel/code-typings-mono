import type { Pet } from '../models/pet'

export type AnimationConfig = {
    frameWidth: number
    frameHeight: number
    frames: number
    fps: number
}

export const animations: Record<string, AnimationConfig> = {
    idle: {
        frameWidth: 64,
        frameHeight: 64,
        frames: 4,
        fps: 4,
    },

    walk: {
        frameWidth: 64,
        frameHeight: 64,
        frames: 6,
        fps: 10,
    },

    sleep: {
        frameWidth: 64,
        frameHeight: 64,
        frames: 4,
        fps: 2,
    },
}

export function updateAnimation(
    pet: Pet,
    deltaTime: number
) {
    const animation = animations[pet.animation]

    if (!animation) return

    if (!(pet)._animationState) {
        ;(pet)._animationState = {
            frame: 0,
            timer: 0,
        }
    }

    const state = (pet)._animationState

    state.timer += deltaTime

    const frameDuration = 1000 / animation.fps

    if (state.timer >= frameDuration) {
        state.timer = 0
        state.frame =
            (state.frame + 1) % animation.frames
    }

    if (pet.element) {
        pet.element.style.backgroundPosition =
            `-${state.frame * animation.frameWidth}px 0px`
    }
}