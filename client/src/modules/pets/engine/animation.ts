import { petAssets } from '../assets/cat/metadata'
import type { BehaviorTypes, Pet } from '../models/pet'

export type AnimationConfig = {
    frameWidth: number
    frameHeight: number
    frames: number
    fps: number
}

export const animations: Record<BehaviorTypes, AnimationConfig> = {
    idle: {
        frameWidth: 64,
        frameHeight: 64,
        frames: 6,
        fps: 4,
    },

    walk: {
        frameWidth: 64,
        frameHeight: 64,
        frames: 6,
        fps: 6,
    },

    sleep: {
        frameWidth: 64,
        frameHeight: 64,
        frames: 6,
        fps: 2,
    },

    follow: {
        frameWidth: 64,
        frameHeight: 64,
        frames: 6,
        fps: 6,
    },
}

export function updateAnimation(
    pet: Pet,
    deltaTime: number
) {
    const animation = animations[pet.currentBehavior]
    // console.log('animation', animation)

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
        
        pet.element.style.backgroundImage = `url(${petAssets[pet.currentBehavior]})`
        
    }
}