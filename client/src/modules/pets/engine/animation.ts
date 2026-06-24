import { serverUrl } from "../../../utils/env";
import type { RunTimePet } from "../models/pet";

export function updateAnimation(pet: RunTimePet, deltaTime: number) {
    const anim = pet.species.animations[pet.currentBehavior] ?? pet.species.animations['idle']

    if (!anim) {
        return
    }

    if (!pet._animationState) {
        pet._animationState = { frame: 0, timer: 0, behavior: '' }
    }

    const st = pet._animationState

    if (st.behavior !== pet.currentBehavior) {
        st.behavior = pet.currentBehavior
        st.frame = 0
        st.timer = 0
    }

    st.timer += deltaTime
    const frameDuration = 1000 / anim.fps
    if (st.timer >= frameDuration) {
        st.timer = 0
        st.frame = (st.frame + 1) % anim.frames
    }

    if (!pet.element) return

    pet.element.style.backgroundPosition = `-${st.frame * anim.frameWidth}px 0px`

    const url = pet.species.spriteSheets[pet.currentBehavior] ?? pet.species.spriteSheets['idle']

    if (url && st.lastUrl !== url) {
        pet.element.style.backgroundImage = `url(${serverUrl}${url})`
        st.lastUrl = url
    }
}