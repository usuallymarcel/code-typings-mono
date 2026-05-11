import { useEffect, useState } from "react"
import { useTheme } from "../../utils/Theme/ThemeContext"
import { usePointsContext } from "../points/contexts/PointsContext"
import { ConfirmPurchaseModal } from './components/confirm'

type Theme = {
    name: string
    price: number
}

type ApiResponse = {
    ok: boolean
    themes: Record<string, { price: number }>
}

const selectedStyling = "bg-blue-400"
const ownedStyling = "bg-pink-600 hover:bg-pink-800"
const brokeStyling = "bg-teal-900 cursor-default"
const buyStyling = "bg-green-600 hover:bg-green-800"

export function ThemeShop() {
    const [themes, setThemes] = useState<Theme[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const { fetchThemes, themes: userThemes, theme: selectedTheme, changeTheme } = useTheme()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [themeToBuy, setThemeToBuy] = useState<string | null>(null)

    const { fetchPoints, points } = usePointsContext()

    const serverUrl = import.meta.env.VITE_FASTAPI_API_URL as string

    useEffect(() => {
        const fetchAllThemes = async () => {
            try {
                const res = await fetch(`${serverUrl}/themes/all`)
                const data = (await res.json()) as ApiResponse

                if (data.ok) {
                    const parsedThemes: Theme[] = Object.entries(data.themes).map(
                        ([name, value]) => ({
                            name,
                            price: value.price
                        })
                    )

                    setThemes(parsedThemes)
                }
            } catch (err) {
                if (err instanceof Error) {
                    setError(err.message)
                }
            }
        }

        fetchAllThemes()
    }, [serverUrl])

    const openConfirmModal = (themeName: string) => {
        setThemeToBuy(themeName)
        setConfirmOpen(true)
    } 

    const buyTheme = async (themeName: string | null) => {
        if (themeName === null) return

        try {
            const res = await fetch(
                `${serverUrl}/themes/buy/${themeName}`,
                {
                    method: "POST",
                    credentials: "include"
                }
            )

            const data = await res.json()

            if (!data.ok) {
                throw new Error(data.detail || "Failed to buy theme")
            }

            await fetchThemes()

	    await fetchPoints()
            
	    changeTheme(themeName)

            setConfirmOpen(false)
            setThemeToBuy(null)
        } catch (err) {
            console.error(err)
        } 
    }

    const themeElements = () => {
        if (!themes) return

        const themesList: React.ReactNode[] = []

        for (const theme of themes) {
            const owned = userThemes.includes(theme.name)
            const selected = theme.name === selectedTheme
            
            const isBroke = points != null && points < theme.price
            const buttonColorStyle = selected ? selectedStyling : owned ? ownedStyling : isBroke ? brokeStyling : buyStyling 
            const buttonText = selected ? 'Selected' : owned ? 'Owned' : 'Buy' 

            const disabled = !owned && isBroke

            const isDefault = theme.price === 0

            const price = isDefault ? 'default' : theme.price

            const onClick = selected ? () => {} : owned ? () => changeTheme(theme.name) : () => openConfirmModal(theme.name)

            themesList.push(
                <div
                key={theme.name}
                className="grid grid-cols-3 gap-2 w-full px-2 items-center"
                >
                    <span className="text-left">
                        {theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}
                    </span>

                    <span className="text-center">
                        {price}
                    </span>

                    <button
                        onClick={onClick}
                        className={`w-full text-black rounded-xl px-1 transition-colors duration-100 ${buttonColorStyle}`}
                        disabled={disabled}
                    >
                        {buttonText}
                    </button>
                </div>
            )   
        }
        

        return themesList
    }

    return (
        <div className="flex items-center justify-center p-15 [background:var(--bg)] rounded-xl border">
            <div className="w-full max-w-md">
                <h2 className="text-xl font-semibold mb-4 text-center">
                    Theme Shop
                </h2>
                <h3 className="text-center mb-2 underline font-bold">Points: {points}</h3>

                {error && (
                    <p className="text-red-400 text-center">{error}</p>
                )}

                {!themes && !error && (
                    <p className="text-center text-neutral-400">Loading...</p>
                )}

                {themes && (
                    <div className="flex flex-col items-center">
                        {themeElements()}
                    </div>
                )}
            </div>
            <ConfirmPurchaseModal isOpen={confirmOpen} onClose={() => {setConfirmOpen(false); setThemeToBuy(null)}} onConfirm={() => buyTheme(themeToBuy)} message={themeToBuy ? `Buy ${themeToBuy}?` : ''} />
        </div>
    )
}
