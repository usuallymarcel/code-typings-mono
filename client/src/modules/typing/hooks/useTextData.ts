import { useEffect, useState } from "react"
import { lengths } from "../components/constants"

type TextData = {
    fontSize: number
    textLength: number
}

const defaultTextData: TextData = {fontSize: 2, textLength: lengths[1]}

export function useTextData() {
    const TEXT_DATA_STORAGE_KEY = 'text-data'

    const [textData, setTextData] = useState<TextData>(() => {
        const textData = localStorage.getItem(TEXT_DATA_STORAGE_KEY)
        return textData ? JSON.parse(textData) : defaultTextData
    })

    useEffect(() => {
        localStorage.setItem(TEXT_DATA_STORAGE_KEY, JSON.stringify(textData))
    }, [textData])


    return [textData, setTextData] as const
}