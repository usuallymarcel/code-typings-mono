import { useEffect, useState } from "react"
import { getRandomText } from "../utils/words"

export const lengths = [10, 25, 50, 100]

export function RandomizeText( {onChange, reloadTrigger, startLength} : { onChange: (text: string, length?: number) => void, reloadTrigger?: number, startLength?: number}) {
    const [randomText, setRandomtext] = useState('')
    const [length, setLength] = useState(startLength ?? 25)
    const [randomize, setRandomize] = useState(0)

    useEffect(() => {
        setRandomtext(getRandomText(length))
    }, [reloadTrigger, length, randomize])

    useEffect(() => {
        onChange(randomText, length)
    }, [randomText, onChange])

    return (
        <>
            <p className="inline">Random text:</p>
            {lengths.map((len) => numberButton(len)
            )}

            <button className="outline px-1 text-gray-500" onClick={() => setRandomize(prev => prev +1)}>Regenerate</button>
        </>
    )

    function numberButton(len: number) {
        return <button key={`button-length-${len}`} className={`hover:text-teal-800 text-teal-600 ${length === len ? `underline` : ``}`} onClick={() => {setLength(len); setRandomize(prev => prev + 1)}}>{len}</button>
    }
}