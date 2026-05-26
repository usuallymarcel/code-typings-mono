import { useEffect } from "react";
import { PetEngine } from "../engine/PetEngine";

const engine = new PetEngine()

export function usePetEngine() {

    useEffect(() => {
        engine.start()

        return () => engine.stop()
    }, [])

    return engine
}