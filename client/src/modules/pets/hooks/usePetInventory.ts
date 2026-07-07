import { useCallback, useEffect, useState } from "react";
import type { PetInstance } from "../models/pet";
import { serverUrl } from "../../../utils/env";

export function usePetInventory() {
    const [inventory, setInventory] = useState<PetInstance[]>([])
    const [loading, setLoading] = useState(false)
    const [groups, setGroups] = useState<string[]>([])

    const fetchInventory = useCallback(async () => {
        setLoading(true)

        try {
            const res = await fetch(`${serverUrl}/pets/inventory`,
                { credentials: 'include' }
            )

            const data = await res.json()

            if (data.ok) {
		const pets = data.pets as PetInstance[]
                setInventory(pets)
		const uniqueGroups = [...new Set(pets.map(pet => pet.source ?? 'misc'))]
	       	setGroups(uniqueGroups)	
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchInventory()
    }, [fetchInventory])

    const setActive = useCallback(async (instanceId: string, active: boolean) => {
        setInventory(prev => prev.map(p => (p.instanceId === instanceId ? { ...p, active } : p)))

        try {
            const res = await fetch(`${serverUrl}/pets/${instanceId}/active`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active })
            })
            if (!res.ok) {
                throw new Error('failed')
            }
        } catch {
            await fetchInventory() //rollback
        }

    }, [fetchInventory])

    const setNickname = useCallback(async (instanceId: string, nickname: string) => {
        try {
            const res = await fetch(`${serverUrl}/pets/${instanceId}/nickname`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-type': 'application/json' },
                body: JSON.stringify({ nickname })
            })

            if (!res.ok) {
                console.log('failed to change nickname')
            }
        } finally {
            await fetchInventory()
        }
    }, [fetchInventory])

    // feed same-species dupes into a target to level it up. the sacrifices are
    // deleted server-side, so refetch once the ritual is done.
    const merge = useCallback(async (targetId: string, sacrifices: string[]) => {
        try {
            const res = await fetch(`${serverUrl}/pets/merge`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: targetId, sacrifices })
            })
            const data = await res.json()
            if (!res.ok || !data.ok) {
                throw new Error(data.detail ?? 'the ritual failed')
            }
            // /pets/merge returns just the levelled-up target, not a full instance
            return data.target as { instanceId: string; speciesId: string; nickname: string | null; level: number }
        } finally {
            await fetchInventory()
        }
    }, [fetchInventory])

    return { inventory, groups, loading, setActive, refetch: fetchInventory, setNickname, merge }
}
