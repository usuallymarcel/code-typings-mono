import { useEffect, useState } from "react"
import { getRandomText } from "../utils/words"

const lengths = [10, 25, 50, 100, 250]

export function RandomizeText( {onChange, reloadTrigger} : { onChange: (text: string) => void, reloadTrigger: number}) {
    const [randomText, setRandomtext] = useState('')
    const [length, setLength] = useState(25)
    const [randomize, setRandomize] = useState(0)

    useEffect(() => {
        setRandomtext(getRandomText(length))
    }, [reloadTrigger, length, randomize])

    useEffect(() => {
        onChange(randomText)
    }, [randomText])

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