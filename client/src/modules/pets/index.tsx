import { useEffect, useMemo } from "react";
import { usePets } from "./hooks/usePets";
import type { RunTimePet } from "./models/pet";
import { toRuntimePet } from "./engine/factory";
import { PetSprite } from "./components/PetSprite";
import { usePetInventoryContext } from "./contexts/PetInventoryContext";
import { usePetSpeciesContext } from "./contexts/PetSpeciesContext";

export function Pets() {
    const { species } = usePetSpeciesContext()
    const { inventory } = usePetInventoryContext()
    const { syncPets, pets } = usePets()

    const active = useMemo<RunTimePet[]>(() => 
        inventory.filter(i => i.active).map(i => {
            const s = species.find(s => s.speciesId === i.speciesId)

            return s && s.owned ? toRuntimePet(i, s) : null
        }).filter((p): p is RunTimePet => p !== null)
    , [species, inventory])

    useEffect(() => {
        syncPets(active)
    }, [active, syncPets])

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
            {pets.map(p => <PetSprite key={p.instanceId} pet={p}/>)}
        </div>
    )
}