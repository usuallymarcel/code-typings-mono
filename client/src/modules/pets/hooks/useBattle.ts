// client/src/modules/pets/hooks/useBattle.ts
import { useCallback, useEffect, useState } from 'react'
import { serverUrl } from '../../../utils/env'
import type {
    BattleProfile,
    FightResponse,
    MergeResponse,
    ProfileResponse,
    TeamPet,
} from '../models/battle'

export function useBattle() {
    const [profile, setProfile] = useState<BattleProfile | null>(null)
    const [team, setTeam] = useState<TeamPet[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const res = await fetch(`${serverUrl}/battle/profile`, {
                credentials: 'include',
            })

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`)
            }

            const data = (await res.json()) as ProfileResponse

            if (!data.ok) {
                throw new Error('Failed to load battle profile')
            }

            setProfile(data.profile)
            setTeam(data.team)
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProfile()
    }, [fetchProfile])

    // Persist an ordered list of owned instance_ids (front-to-back, <=5).
    const saveTeam = useCallback(async (instanceIds: string[]) => {
        const res = await fetch(`${serverUrl}/battle/team`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team: instanceIds }),
        })

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
        }

        const data = (await res.json()) as ProfileResponse

        if (!data.ok) {
            throw new Error('Failed to save team')
        }

        setProfile(data.profile)
        setTeam(data.team)

        return data.team
    }, [])

    // Run one battle. Server simulates + rewards; we just get the log back.
    const fight = useCallback(async (): Promise<FightResponse> => {
        const res = await fetch(`${serverUrl}/battle/fight`, {
            method: 'POST',
            credentials: 'include',
        })

        const data = (await res.json()) as FightResponse | { ok: false; error?: string }

        if (!res.ok || !data.ok) {
            const message = !data.ok && 'error' in data && data.error
                ? data.error
                : `HTTP ${res.status}`
            throw new Error(message)
        }

        // Reflect the post-fight ladder state immediately.
        setProfile(prev =>
            prev
                ? { ...prev, trophies: data.trophiesAfter, streak: data.streakAfter }
                : prev
        )

        return data
    }, [])

    // Feed a duplicate INTO a target of the same species (+1 xp, sacrifice deleted).
    // Server returns { ok, target: { instanceId, speciesId, level, xp, attack, health } }.
    const merge = useCallback(async (
        targetInstanceId: string,
        sacrificeInstanceId: string,
    ): Promise<MergeResponse['target']> => {
        const res = await fetch(`${serverUrl}/pets/merge`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetInstanceId, sacrificeInstanceId }),
        })

        const data = (await res.json()) as MergeResponse | { ok: false; error?: string }

        if (!res.ok || !data.ok) {
            const message = !data.ok && 'error' in data && data.error
                ? data.error
                : `HTTP ${res.status}`
            throw new Error(message)
        }

        return data.target
    }, [])

    return {
        profile,
        team,
        loading,
        error,
        refetch: fetchProfile,
        saveTeam,
        fight,
        merge,
    }
}
