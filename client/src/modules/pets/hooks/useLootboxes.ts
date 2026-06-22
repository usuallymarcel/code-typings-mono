import { useCallback, useEffect, useState } from "react";
import type { LootboxOpenResult, LootboxSummary } from "../models/pet";
import { serverUrl } from "../../../utils/env";

export function useLootboxes() {
    const [boxes, setBoxes] = useState<LootboxSummary[]>([])
    const [opening, setOpening] = useState(false)

    const fetchBoxes = useCallback(async () => {
        const res = await fetch(`${serverUrl}/lootboxes`, {
            credentials: 'include'
        })

        const data = await res.json()

        const boxes = data.boxes as LootboxSummary[]

        if (data.ok) {
            setBoxes(boxes)
        }
    }, [])

    useEffect(() => {
        fetchBoxes()
    }, [fetchBoxes])

    const open = useCallback(async (sku: string) => {
        setOpening(true)

        try {
            const res = await fetch(`${serverUrl}/lootboxes/${sku}/open`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': crypto.randomUUID()
                }
            })

            const data = await res.json()

            if (!res.ok || !data.ok) {
                throw new Error(data.detail ?? 'open failed')
            }

            return data as LootboxOpenResult
            
        } finally {
            setOpening(false)
        }

    }, [])

    return { boxes, open, opening, refetch: fetchBoxes }
}