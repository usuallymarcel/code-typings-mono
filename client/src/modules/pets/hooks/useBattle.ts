import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'
import type { BattleTeam, FightResult } from '../models/battle'

export function useBattle() {
    const [teams, setTeams] = useState<BattleTeam[]>([])
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)

    const fetchTeams = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`${serverUrl}/battle/teams`, { credentials: 'include' })
            const data = await res.json()
            if (data.ok) {
                setTeams(data.teams as BattleTeam[])
            }
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchTeams()
    }, [fetchTeams])

    const saveTeam = useCallback(async (name: string, team: string[]) => {
        setBusy(true)
        try {
            const res = await fetch(`${serverUrl}/battle/team`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, team }),
            })
            const data = await res.json()
            if (!res.ok || !data.ok) {
                throw new Error(data.detail ?? 'could not save team')
            }
            setTeams(data.teams as BattleTeam[])
        } finally {
            setBusy(false)
        }
    }, [])

    const fight = useCallback(async (teamId: number) => {
        setBusy(true)
        try {
            const res = await fetch(`${serverUrl}/battle/fight/${teamId}`, {
                method: 'POST',
                credentials: 'include',
            })
            const data = await res.json()
            if (!res.ok || !data.ok) {
                throw new Error(data.detail ?? 'could not start battle')
            }
            return data as FightResult
        } finally {
            setBusy(false)
        }
    }, [])

    return { teams, loading, busy, refetch: fetchTeams, saveTeam, fight }
}
