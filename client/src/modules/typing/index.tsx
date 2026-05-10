import {useEffect, useState, useRef, type ChangeEvent, useCallback } from 'react'
import { useDebouncedSound } from '../sound/useDebouncedSound'
import { SoundSettingsModal } from '../sound/SoundSettings'
import { useJuice } from './hooks/useJuice'
import type { TypingStats } from './utils/stats'
import { calculateWPM, calculateAccuracy, calculateCharactersPerSecond } from './utils/stats'
import { useGameLoop } from './hooks/useGameLoop'
// import FileUploader from './components/fileUploader'
// import TextSelector from './components/textSelector'
import { RandomizeText } from './components/randomizeText'
import { OutlineButton } from '../../components/outline-button'
import { useModal } from '../../components/modal/ModalContext'
import { useTextData } from './hooks/useTextData'
import styles from './styles/typing.module.css'
import Login from '../login'
import { Leaderboard } from '../leaderboard'
import { useUser } from '../../utils/User/UserContext'
import { useLeaderboardEntry } from '../leaderboard/hooks/useLeaderboardEntry'
import Gamble from '../points'
import { usePointsContext } from '../points/contexts/PointsContext'
import { ThemeShop } from '../themes'
import Chat from '../chat'

const sizeClasses = [
    "text-xl",
    "text-2xl",
    "text-3xl",
    "text-4xl",
    "text-5xl",
]

export default function Typing() {
    const [input, setInput] = useState<string>("")
    const [startTime, setStartTime] = useState<number | null>(null)
    const [endTime, setEndTime] = useState<number | null>(null)
    const [typingDisabled, setTypingDisabled] = useState(false)
    const [shake, setShake] = useState(false)
    const [juice, setJuice] = useJuice()
    const [stats, setStats] = useState<TypingStats>({wpm: 0, accuracy: 0, cps: 0, combo: 0, cpsXcombo: 0})
    const [score, setScore] = useState(0)
    const maxCombo = useRef(0)
    const comboRef = useRef(1)
    const defaultText = 'Select a text file or upload a new one'
    const [typeText, setTypeText] = useState<string>(defaultText)
    const { openModal, isModalOpen } = useModal()
    const [textData, setTextData] = useTextData()
    const textSizeClass = sizeClasses[textData.fontSize - 1]
    const [textReloadTrigger, setTextReloadTrigger] = useState(0)
		

    // const { playSound } = useSound()
    const playType = useDebouncedSound('type')
    const playPop = useDebouncedSound('pop')
    const playPaper = useDebouncedSound('paper')
    const playOops = useDebouncedSound('oops')
    const playError = useDebouncedSound('error')

    const { user, loading, logout } = useUser()
    const { sendLeaderboardEntry } = useLeaderboardEntry()
    const { fetchPoints, points, updatePoints } = usePointsContext()

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
        if(isModalOpen === false) {
            setTextReloadTrigger(prev => prev + 1)
        }

        if (!typingDisabled && !isModalOpen) {
            inputRef.current?.focus()
        }
    }, [typingDisabled, isModalOpen])

    
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

    useEffect(() => {
        if (startTime !== null || isModalOpen) return

        const interval = setInterval(() => {
            console.log('5 seconds idle reset')
            setTextReloadTrigger(prev => prev + 1)

        }, 5000)

        return () => clearInterval(interval)
    }, [startTime, isModalOpen])

    const handleTextChange = useCallback((text: string, length: number) => {
        reset()
        setTypeText(text)

        if(!isModalOpen) {
            inputRef.current?.focus()
        }
        
        setTextData(prev => ({...prev, textLength: length}))
    }, [setTextData, isModalOpen])

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
            setTextReloadTrigger(prev => prev + 1)
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

        
    const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {

        const value = e.target.value

        if (!startTime && value.length === 1) {
            setStartTime(Date.now())
        }

        if(value.length === typeText.length) {
            const score = Math.round(stats.wpm * (stats.accuracy/100))
            const category = textData.textLength.toString()
            
            setEndTime(Date.now())
            setTypingDisabled(true)
            if (user) {
                await sendLeaderboardEntry(score, category)
                await updatePoints(score, category)
                await fetchPoints()
            }
            // setScore(Math.round(stats.wpm * stats.accuracy * maxCombo.current))
            setScore(score)
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

            let color = "text-[var(--typings-base)]"
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
                cursor = "bg-[var(--typings-cursor)]"
            }

            if (globalIndex < input.length) {
                if (char === input[globalIndex]) {
                    color = "text-[var(--typings-correct)]"
                } else {
                    color = "text-[var(--typings-error)]"
                    letter = input[globalIndex]
                }
            }

            letters.push(
                <span
                    key={`char-${globalIndex}`}
                    className={`${color} inline-block ${textSizeClass} ${styles.transitionFont} leading-relaxed ${effect} ${cursor}`}
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
        <div>
            <div className="flex items-center justify-end pr-5">
            {loading && <p className="pr-5">Loading...</p>}
            {user?.name && <p className="pr-5">Logged in as: {user?.name}</p>}
            {user ? <button className="border px-2 rounded-md cursor-pointer hover:bg-gray-800" onClick={logout}>Log out</button> :
            <button className="border px-2 rounded-md cursor-pointer hover:bg-gray-800" onClick={() => openModal(<Login />)}>Login/Sign up</button>}
            </div>
            <div className="flex flex-wrap justify-between items-center my-5">
                <div className="flex flex-wrap gap-10">
                    <OutlineButton onClick={() => {setTextData(prev => ({...prev, fontSize:  Math.max(prev.fontSize - 1, 1)}))}} width="50px">-</OutlineButton>
                    <OutlineButton onClick={() => {setTextData(prev => ({...prev, fontSize: Math.min(prev.fontSize + 1, 5)}))}} width="50px">+</OutlineButton>
                </div>

                <div className="inline-block justify-end min-w-20 max-w-full">
                <p>WPM: {stats.wpm || '__'}</p>
                <p>ACC: {stats.accuracy || '__'}</p>
                {/* <p>Characters Per Second (CPS): {stats.cps}</p> */}
                {/* <p>cps * combo: {stats.cpsXcombo}</p> */}
                </div>
            </div>
            <div className={`py-8 w-full max-w-4xl whitespace-pre-wrap ${shake ? "animate-shake" : ""}`} onClick={() => {
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
		onPaste={(e) => {e.preventDefault()}}
                className="typingInput"
                autoComplete='off'
                data-bwignore="1"
            />
            {/* <div
                className="flex items-center justify-center text-4xl font-bold tabular-nums transition-all duration-200"
                style={{
                    transform: `scale(${1 + (stats.combo - 1) * 0.5})`
                }}
                >
                x{stats.combo.toFixed(2)}
            </div> */}
                <p>WPM * (ACC/100): {score}</p>
                <p>Points: {points}</p>
                
            <p className="my-4 italic text-sm">Press <span className="font-bold">Esc</span> to reset text</p>


            <div className="flex flex-wrap gap-5 justify-center my-5">
                <div className='flex flex-wrap gap-5 justify-center'>

                {/* <OutlineButton onClick={reset}>Reset</OutlineButton> */}
                <OutlineButton onClick={() => setJuice(prev => !prev)}>
                    juice: <span className="inline-block w-8 text-center">{juice ? "ON" : "OFF"}</span>
                </OutlineButton>
                </div>
                <div className='flex flex-wrap gap-5 justify-center'>
                {/* <OutlineButton onClick={() => openModal(<FileUploader onUploadSuccess={() => {
                setReloadTexts(prev => prev + 1)
                }}/>)}>
                Upload
                </OutlineButton> */}

                <OutlineButton onClick={() => openModal(<SoundSettingsModal/>)}>
                    Sound Settings
                </OutlineButton>
                <OutlineButton onClick={() => openModal(<Leaderboard />)}>Leaderboard</OutlineButton>

                {user && <OutlineButton onClick={() => openModal(<Gamble />)}>Gamble</OutlineButton>}
                {user && <OutlineButton onClick={() => openModal(<ThemeShop />)}>Themes</OutlineButton>}
                {<OutlineButton onClick={() => openModal(<Chat />)}>Chat</OutlineButton>}
                </div>
            </div>

            <div className="flex flex-wrap justify-center items-center py-4 gap-10">
            <RandomizeText 
            onChange={() => handleTextChange}
            startLength={textData.textLength}
            reloadTrigger={textReloadTrigger}
            />
            {/* <p>or</p> */}
            {/* <TextSelector 
            onChange={handleTextChange}
            reloadTrigger={reloadTexts}
            /> */}

            </div>

            {/* <Meter percentage={stats.combo > 1 ? stats.combo * 50 : 0}/> */}

            {/* <div className="flex flex-col gap-10"> */}

            {/* </div> */}

            
        </div>
    )
}
