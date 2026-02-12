
export function calculateWPM(startTime: number, length: number, endTime?: number): number {

    const elapsed = (endTime ?? Date.now()) - startTime
    const minutes = elapsed / 1000 / 60

    return Math.round((length / 5) / minutes)
}

export function calculateAccuracy(input: string, text: string): number {
    return Math.round((input.split("").filter((char, i) => char === text[i]).length / input.length) * 100)
}

export interface TypingStats {
    wpm: number
    accuracy: number
    cps: number
    combo: number
    cpsXcombo: number
}

export function calculateCharactersPerSecond(startTime: number, input: string, endTime?: number) : number {

    const elapsed = (endTime ?? Date.now()) - startTime
    const seconds = elapsed / 1000

    return input.length/seconds
}

export function calculateMultiplier(lengthOfCorrectChars: number): number {
    
    return Math.min(Math.max(lengthOfCorrectChars/50, 1), 2)
}

export function caluclateCorrectLetterChain(value: string, text: string): number {
    let chain = 0

    for(let i = 0; i < value.length; i++) {
        if (value[i] === text[i]){
            chain++
        } else {
            chain = 0
        }
    }

    return chain
}