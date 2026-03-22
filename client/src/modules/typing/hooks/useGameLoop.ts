import { useEffect, useRef } from "react"

type UseGameLoopProps = {
    enabled: boolean
    onTick: (deltaTime: number) => void
}

export function useGameLoop({ enabled, onTick }: UseGameLoopProps) {
    const savedCallback = useRef(onTick)
    const frameRef = useRef<number | undefined>(undefined)
    const lastTimeRef = useRef<number | undefined>(undefined)

    useEffect(() => {
        savedCallback.current = onTick
    }, [onTick])

    useEffect(() => {
        if (!enabled) return

        const loop = (time: number) => {
            if (lastTimeRef.current != null) {
                const deltaTime = (time - lastTimeRef.current) / 1000
                savedCallback.current(deltaTime)
            }

            lastTimeRef.current = time
            frameRef.current = requestAnimationFrame(loop)
        }

        frameRef.current = requestAnimationFrame(loop)

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current)
            lastTimeRef.current = undefined
        }
    }, [enabled])
}
