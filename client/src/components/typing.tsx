import {useEffect, useState, useRef, type ChangeEvent } from 'react'

const TEXT: string = "The quick brown fox jumped over the lazy dog"


export default function Typing() {
    const [input, setInput] = useState<string>("")
    const [startTime, setStartTime] = useState<number | null>(null)
    const [endTime, setEndTime] = useState<number | null>(null)
    const [typingDisabled, setTypingDisabed] = useState(false)
    const [serverRes, setServiceRes] = useState<{message: string}>({ message: ''})
    const inputRef = useRef<HTMLInputElement | null>(null)

    // useEffect(() => {
    //     inputRef.current?.focus()
    //     fetch(`${process.env.REACT_APP_API_KEY}/api`)
    //     .then((res) => res.json())
    //     .then((data) => setServiceRes(data.message))
    // }, [])

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

        if(value.length === TEXT.length) {
            setEndTime(Date.now())
            setTypingDisabed(true)
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

    const accuracy = input.length > 0 ? Math.round((input.split("").filter((char, i) => char === TEXT[i]).length / input.length) * 100) : 100

    return (
        <div className="font-mono bg-neutral-900 text-white min-h-screen p-10">
            {/* <h1>Code Typing</h1> */}

            <div>
                {TEXT.split("").map((char, i) => {
                    let color = "text-white-500"
                    if (i < input.length) {
                        color = char === input[i] ? "text-lime-500" : "text-red-500"
                    }
                    return (<span key={i} className={`${color} text-2xl mb-5 leading-relaxed`}>{char}</span>)
                })}
            </div>

            <input 
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
            <p>{serverRes.message}</p>
        </div>
    )
}