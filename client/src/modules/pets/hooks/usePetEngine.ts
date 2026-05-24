import { useEffect, useState } from "react";
import { PetEngine } from "../engine/PetEngine";

export function usePetEngine() {
    const [engine, setEngine] = useState<PetEngine | null>(null)

    if (!engine) {
        setEngine(new PetEngine())
    }

    useEffect(() => {
        if(!engine) return
        
        engine.start()


        return () => {
            engine.stop()
        }
    }, [engine])

    return engine
}