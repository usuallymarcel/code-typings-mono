import type { PetInstance, PetSpecies, RunTimePet } from "../models/pet";

export function toRuntimePet(instance: PetInstance, species: PetSpecies): RunTimePet {
    return {
        instanceId: instance.instanceId,
        nickname: instance.nickname,
        species,
        x: Math.random() * (window.innerWidth - species.width),
        y: window.innerHeight - species.height - 20,
        vx: 0,
        vy: 0,
        targetVx: 0,
        targetVy: 0,
        direction: 1,
        currentBehavior: species.behaviorBag[0] ?? 'idle',
        behaviorTimer: 0
    }
}