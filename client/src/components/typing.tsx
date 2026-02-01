import {useEffect, useState, useRef, type ChangeEvent } from 'react'
import { useSound } from '../hooks/useSound'

export default function Typing() {
    const [input, setInput] = useState<string>("")
    const [startTime, setStartTime] = useState<number | null>(null)
    const [endTime, setEndTime] = useState<number | null>(null)
    const [typingDisabled, setTypingDisabed] = useState(false)
    const [typeText, setTypeText] = useState<string>('')
    const [shake, setShake] = useState(false)
    const { playSound } = useSound()

    
    // const typeSpaceSound = useRef(new Audio("/sounds/spacebar.wav"))

    const inputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        inputRef.current?.focus()
        fetch(`${import.meta.env.VITE_API_URL}/api`)
        .then((res) => res.json())
        .then((data) => {
            setTypeText(data.message)
        })
    }, [])

    useEffect(() => {
        const listener = (event: KeyboardEvent) => {handleKeyPress(event)}

        window.addEventListener('keydown', listener)

        return () => {
            window.removeEventListener('keydown', listener)
        }
    }, [])

    const handleKeyPress = (event: KeyboardEvent) => {
        switch(event.key) {
            case 'Escape':
                reset()
                event.stopPropagation() //i think to stop esc from doing anything else
                break
            case ' ': //spacebar
                handleSpace()
                break
        }
    }

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {

        const value = e.target.value

        if (!startTime && value.length === 1) {
            setStartTime(Date.now())
        }

        if(value.length === typeText.length) {
            setEndTime(Date.now())
            setTypingDisabed(true)
        }

        if (value.length > input.length) {
            const i = value.length - 1
            if (value[i] !== typeText[i]) {
                playSound('error', 0.4)                
                playSound('oops', 0.2)                
                setShake(true)
                setTimeout(() => setShake(false), 200)
            } else {
                // typeSound.current.play()
                playSound('type', 0.8)
                // playSound(dingSound.current, 0.2)
                playSound('pop', 0.6)
                playSound('paper', 0.6)
                // playSound(jumpSound.current, 0.6)
                
            }

        }

        setInput(value)
    }

    const reset = () => {
        setInput("")
        setStartTime(null)
        setEndTime(null)
        setTypingDisabed(false)
        inputRef.current?.focus()
    }

    const handleSpace = () => {
        console.log('spacebar')
    }

    const elapsed: number | null = startTime ? (endTime ?? Date.now()) - startTime : null

    const minutes = elapsed ? elapsed / 1000 / 60 : 0

    const wpm = minutes > 0 ? Math.round((input.length / 5 ) / minutes) : 0

    const accuracy = input.length > 0 ? Math.round((input.split("").filter((char, i) => char === typeText[i]).length / input.length) * 100) : 100

    return (
        <div className="font-mono bg-neutral-900 text-white min-h-screen p-10">
            {/* <h1>Code Typing</h1> */}

            <div className={`whitespace-pre-wrap ${shake ? "animate-shake" : ""}`}>
                {typeText.split("").map((char, i) => {
                    let color = "text-white-500"
                    let effect = ''

                    if (i === input.length-1) {
                        effect = char === input[i] ? 'font-bold animate-juice' : ''
                        // effect = char === input[i] ? 'font-bold' : ''
                    }
                    if (i < input.length) {
                        color = char === input[i] ? "text-lime-500" : "text-red-500"
                    }
                    return (<span key={i} 
                        className={`${color} inline-block text-2xl leading-relaxed ${effect}`}>
                            {char}
                            </span>)
                })}
            </div>

            <input
                id={'text-input'} 
                ref={inputRef}
                value={input}
                onChange={handleChange}
                spellCheck={false}
                disabled={typingDisabled}
                className="flex flex-row"
            />

            <div className="mt-5">
                <p>WPM: {wpm}</p>
                <p>Accuracy: {accuracy}</p>
            </div>

            <button onClick={reset}>Reset</button>
            {/* <div className="inline-block text-4xl animate-juice">TEST</div> */}

        </div>
    )
}