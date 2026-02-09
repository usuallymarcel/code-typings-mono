
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
}