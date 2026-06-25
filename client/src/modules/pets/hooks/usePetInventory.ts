import { useCallback, useEffect, useState } from "react";
import type { PetInstance } from "../models/pet";
import { serverUrl } from "../../../utils/env";

export function usePetInventory() {
    const [inventory, setInventory] = useState<PetInstance[]>([])
    const [loading, setLoading] = useState(false)

    const fetchInventory = useCallback(async () => {
        setLoading(true)

        try {
            const res = await fetch(`${serverUrl}/pets/inventory`,
                { credentials: 'include' }
            )

            const data = await res.json()

            if (data.ok) {
                setInventory(data.pets)
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

    return { inventory, loading, setActive, refetch: fetchInventory, setNickname }
}