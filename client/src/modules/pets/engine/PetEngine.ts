import type { Pet } from '../models/pet'
import { updateBehavior } from './behaviors'
import { updatePhysics } from './physics'
import {
    resolvePetCollision,
    resolveScreenBounds,
} from './collisions'
import { updateAnimation } from './animation'

export class PetEngine {
    pets: Pet[] = []

    running = false

    lastTime = performance.now()

    addPet(pet: Pet) {
        if (this.pets.some(p => p.id === pet.id)) return
        this.pets.push(pet)
    }

    setPetElement(pet: Pet, element: HTMLDivElement) {
        pet.element = element
    }

    removePet(id: string) {
        this.pets = this.pets.filter(p => p.id !== id)
    }

    start() {
        if (this.running) return

        this.running = true

        const loop = (time: number) => {
            if (!this.running) return

            const deltaTime = time - this.lastTime
            this.lastTime = time

            for (const pet of this.pets) {
                updateBehavior(pet, deltaTime)
                updatePhysics(pet)
                resolveScreenBounds(pet)
                updateAnimation(pet, deltaTime)
            }

            // collisions
            for (let i = 0; i < this.pets.length; i++) {
                for (let j = i + 1; j < this.pets.length; j++) {
                    resolvePetCollision(
                        this.pets[i],
                        this.pets[j]
                    )
                }
            }

            // render
            for (const pet of this.pets) {
                if (!pet.element) continue
                pet.element.style.transform =
                    `translate(${pet.x}px, ${pet.y}px) scaleX(${pet.direction})`
            }

            requestAnimationFrame(loop)
        }

        requestAnimationFrame(loop)
    }

    stop() {
        this.running = false
    }
}