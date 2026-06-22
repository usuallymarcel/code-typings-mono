import { updateBehavior } from './behavior'
import { updatePhysics } from './physics'
import {
    resolvePetCollision,
    resolveScreenBounds,
} from './collisions'
import { updateAnimation } from './animation'
import type { RunTimePet } from '../models/pet'

export class PetEngine {
    pets: RunTimePet[] = []

    running = false

    lastTime = performance.now()

    syncPets(targets: RunTimePet[]) {
        const wanted = new Set(targets.map(t => t.instanceId))

        this.pets = this.pets.filter(p => wanted.has(p.instanceId))

        for (const t of targets) {
            if (!this.pets.some(p => p.instanceId === t.instanceId)) {
                this.pets.push(t)
            }
        }
    }

    setPetElement(pet: RunTimePet, element: HTMLDivElement) {
        pet.element = element
    }

    start() {
        if (this.running) return

        this.running = true
        
        this.lastTime = performance.now()

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