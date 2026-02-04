import {useEffect, useState, useRef, type ChangeEvent } from 'react'
// import { useSound } from '../sound/useSound'
import { useDebouncedSound } from '../sound/useDebouncedSound'
import { SoundSettings } from '../sound/SoundSettings'
import { useJuice } from '../juice/useJuice'

export default function Typing() {
    const [input, setInput] = useState<string>("")
    const [startTime, setStartTime] = useState<number | null>(null)
    const [endTime, setEndTime] = useState<number | null>(null)
    const [typingDisabled, setTypingDisabled] = useState(false)
    const [typeText, setTypeText] = useState<string>('')
    const [shake, setShake] = useState(false)
    const [juice, setJuice] = useJuice()

    // const { playSound } = useSound()
    const playType = useDebouncedSound('type')
    const playPop = useDebouncedSound('pop')
    const playPaper = useDebouncedSound('paper')
    const playOops = useDebouncedSound('oops')
    const playError = useDebouncedSound('error')
    
    // const typeSpaceSound = useRef(new Audio("/sounds/spacebar.wav"))

    const inputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
    if (!typingDisabled) {
        inputRef.current?.focus()
    }
    }, [typingDisabled])

    useEffect(() => {
        inputRef.current?.focus()
        fetch(`${import.meta.env.VITE_API_URL}/api/text`)
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
            setTypingDisabled(true)
        }

        if (value.length > input.length) {
            const i = value.length - 1
            if (value[i] !== typeText[i]) {   
                playError()
                playOops()           
                triggerShake()
            } else {
                playType()
                playPop()
                playPaper()
            }

        }

        setInput(value)
    }

    const triggerShake = () => {
        setShake(true)
        setTimeout(() => setShake(false), 200)
    }

    const reset = () => {
        setInput("")
        setStartTime(null)
        setEndTime(null)
        setTypingDisabled(false)
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
                        effect = char === input[i] ? `font-bold ${juice ? 'animate-juice' : ''}` : ''
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
            <div>
                <button onClick={() => setJuice(prev => !prev)}>
                    {juice ? 'Juice On :)' : 'Juice Off :|'}
                </button>
            </div>
            <SoundSettings/>
        </div>
    )
}