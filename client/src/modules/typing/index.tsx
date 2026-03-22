import {useEffect, useState, useRef, type ChangeEvent, useCallback } from 'react'
// import { useSound } from '../sound/useSound'
import { useDebouncedSound } from '../sound/useDebouncedSound'
import { SoundSettings } from '../sound/SoundSettings'
import { useJuice } from './hooks/useJuice'
import type { TypingStats } from './utils/stats'
import { calculateWPM, calculateAccuracy, calculateCharactersPerSecond } from './utils/stats'
import { useGameLoop } from './hooks/useGameLoop'
import FileUploader from './components/fileUploader'
import TextSelector from './components/textSelector'
import { RandomizeText } from './components/randomizeText'

export default function Typing() {
    const [input, setInput] = useState<string>("")
    const [startTime, setStartTime] = useState<number | null>(null)
    const [endTime, setEndTime] = useState<number | null>(null)
    const [typingDisabled, setTypingDisabled] = useState(false)
    const [shake, setShake] = useState(false)
    const [juice, setJuice] = useJuice()
    const [stats, setStats] = useState<TypingStats>({wpm: 0, accuracy: 100, cps: 0, combo: 0, cpsXcombo: 0})
    const [score, setScore] = useState(0)
    const maxCombo = useRef(0)
    const comboRef = useRef(1)
    const defaultText = 'Select a text file or upload a new one'
    const [typeText, setTypeText] = useState<string>(defaultText)
    const [reloadTexts, setReloadTexts] = useState(0)
    const [randomizeText, setRandomizeText] = useState(0)
    // const [useRandomText, setUseRandomText] = useState(true)



    // const { playSound } = useSound()
    const playType = useDebouncedSound('type')
    const playPop = useDebouncedSound('pop')
    const playPaper = useDebouncedSound('paper')
    const playOops = useDebouncedSound('oops')
    const playError = useDebouncedSound('error')
    
    // const typeSpaceSound = useRef(new Audio("/sounds/spacebar.wav"))

    const inputRef = useRef<HTMLInputElement | null>(null)

    useGameLoop({
        enabled: !!startTime && !typingDisabled,
        onTick: (dt) => {
            if (!startTime) return

            const wpm = calculateWPM(startTime, input.length, endTime ?? undefined)
            const accuracy = calculateAccuracy(input, typeText)
            const cps = calculateCharactersPerSecond(startTime, input, endTime ?? undefined)

            comboRef.current -= dt * (comboRef.current * 0.1)

            if (comboRef.current < 1) {
                comboRef.current = 1
            }

            const multiplier = comboRef.current
            const cpsXcombo = cps * multiplier

            setStats({
                wpm,
                accuracy,
                cps,
                combo: multiplier,
                cpsXcombo
            })

            // setScore(prev => prev + cpsXcombo * dt)
        }
    })

    const typingDisabledRef = useRef(typingDisabled)

    useEffect(() => {
        typingDisabledRef.current = typingDisabled
    }, [typingDisabled])

    useEffect(() => {
    if (!typingDisabled) {
        inputRef.current?.focus()
    }
    }, [typingDisabled])

    const reset = () => {
        setInput("")
        setStartTime(null)
        setEndTime(null)
        setTypingDisabled(false)

        comboRef.current = 1
        maxCombo.current = 1
        setStats({ wpm: 0, accuracy: 0, cps: 0, combo: 0, cpsXcombo: 0})
        setScore(0)
    }

    const handleTextChange = (text: string) => {
        reset()
        setTypeText(text)
        inputRef.current?.focus()
    }

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSpace = () => {
        console.log('spacebar')
    }
    
    const handleKeyPress = useCallback((event: KeyboardEvent) => {
    switch(event.key) {
        case 'Escape':
            reset()
            break
        case ' ': //spacebar
            handleSpace()
            break
        }
    }, [])

    useEffect(() => {
        const listener = (event: KeyboardEvent) => {handleKeyPress(event)}

        window.addEventListener('keydown', listener)

        return () => {
            window.removeEventListener('keydown', listener)
        }
    }, [handleKeyPress])

        
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {

        const value = e.target.value

        if (!startTime && value.length === 1) {
            setStartTime(Date.now())
        }

        if(value.length === typeText.length) {
            setEndTime(Date.now())
            setTypingDisabled(true)
            setScore(stats.wpm * stats.accuracy * maxCombo.current)
        }

        if (value.length > input.length) {
            const i = value.length - 1
            if (value[i] !== typeText[i]) {
                comboRef.current *= 0.90
                if (comboRef.current < 1) comboRef.current = 1
                
                playError()
                playOops()           
                triggerShake()
            } else {
                comboRef.current += 0.02 + comboRef.current * 0.01

                if(comboRef.current > maxCombo.current) {
                    maxCombo.current = comboRef.current
                }

                playType()
                playPop()
                playPaper()
            }

        }
        // if (startTime) {
        //     setStats({
        //         wpm: calculateWPM(startTime, input.length, endTime ?? undefined), 
        //         accuracy: calculateAccuracy(value, typeText),
        //         cps: calculateCharactersPerSecond(startTime, input, endTime ?? undefined),
        //         combo: calculateMultiplier(correctLetterChain),
        //         cpsXcombo: stats.combo * stats.cps
        //     })
        // }

        setInput(value)
    }

    const triggerShake = () => {
        setShake(true)
        setTimeout(() => setShake(false), 200)
    }

const displayTypeText = () => {
    const elements = []
    const tokens = typeText.match(/\S+\s*/g) || []
    
    let globalIndex = 0

    for (let w = 0; w < tokens.length; w++) {
        const token = tokens[w]

        const letters = []

        for (let i = 0; i < token.length; i++) {
            const char = token[i]

            let color = "text-white-500"
            let effect = ""
            let cursor = ""
            let letter = ""

            if (globalIndex === input.length - 1) {
                effect =
                    char === input[globalIndex]
                        ? `font-bold ${juice ? "animate-juice" : ""}`
                        : ""
            }

            if (globalIndex === input.length) {
                cursor = "bg-gray-700"
            }

            if (globalIndex < input.length) {
                if (char === input[globalIndex]) {
                    color = "text-lime-500"
                } else {
                    color = "text-red-500"
                    letter = input[globalIndex]
                }
            }

            letters.push(
                <span
                    key={`char-${globalIndex}`}
                    className={`${color} inline-block text-2xl leading-relaxed ${effect} ${cursor}`}
                >
                    {letter || char}
                </span>
            )

            globalIndex++
        }

        elements.push(
            <div key={`word-${w}`} className="inline-block">
                {letters}
            </div>
        )
}

    return elements
}


    return (
        <div className="font-mono bg-neutral-900 text-white min-h-screen p-10">
            {/* <h1>Code Typing</h1> */}

            <div className={`whitespace-pre-wrap max-w-4xl ${shake ? "animate-shake" : ""}`} onClick={() => {
                inputRef.current?.focus()
            }}>
                { displayTypeText() }
            </div>

            <input
                id={'text-input'}
                ref={inputRef}
                value={input}
                onChange={handleChange}
                spellCheck={false}
                disabled={typingDisabled}
                className="flex flex-row opacity-0"
                autoComplete='off'
            />
            <div
                className="flex items-center justify-center text-4xl font-bold tabular-nums transition-all duration-200"
                style={{
                    transform: `scale(${1 + (stats.combo - 1) * 0.5})`
                }}
                >
                x{stats.combo.toFixed(2)}
            </div>

            <div className="mt-5">
                <p>Words Per Minute (WPM): {stats.wpm}</p>
                <p>Accuracy: {stats.accuracy}</p>
                <p>Characters Per Second (CPS): {stats.cps}</p>
                {/* <p>cps * combo: {stats.cpsXcombo}</p> */}
            </div><br />

            <p>Score: {score}</p><br />

            <button onClick={reset}>Reset</button>
            <div>
                <button onClick={() => setJuice(prev => !prev)}>
                    {juice ? 'Juice On :)' : 'Juice Off :|'}
                </button>
            </div><br />
            <div className="space-x-10 space-y-2">
            <RandomizeText 
            onChange={handleTextChange}
            reloadTrigger={randomizeText}/>
            <p>or</p>
            <TextSelector 
            onChange={handleTextChange}
            reloadTrigger={reloadTexts}
            />

            </div>

            {/* <Meter percentage={stats.combo > 1 ? stats.combo * 50 : 0}/> */}
            <FileUploader onUploadSuccess={() => {
                setReloadTexts(prev => prev + 1)
            }}/>

            <SoundSettings/>

            
            <p className="my-4 italic text-sm">Press <span className="font-bold">Esc</span> to reset text</p>
        </div>
    )
}
