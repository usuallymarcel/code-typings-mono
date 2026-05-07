import { useEffect, useState } from "react"
import { useTheme } from "../../utils/Theme/ThemeContext"
import { usePoints } from "../points/hooks/usePoints"

type Theme = {
    name: string
    price: number
}

type ApiResponse = {
    ok: boolean
    themes: Record<string, { price: number }>
}

export function ThemeShop() {
    const [themes, setThemes] = useState<Theme[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    const { fetchThemes, themes: userThemes } = useTheme()

    const { points } = usePoints()

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
    }, [])

    const buyTheme = async (themeName: string) => {

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

            fetchThemes()
        } catch (err) {
            console.error(err)
        } 
    }

    return (
        <div className="flex items-center justify-center p-20 bg-[var(--bg)] rounded-xl border">
            <div className="w-full max-w-md">
                <h2 className="text-xl font-semibold mb-4 text-center">
                    Theme Shop
                </h2>

                {error && (
                    <p className="text-red-400 text-center">{error}</p>
                )}

                {!themes && !error && (
                    <p className="text-center text-neutral-400">Loading...</p>
                )}

                {themes && (
                    <div className="flex flex-col items-center">
                        {themes.map((theme) => (
                            <div
                            key={theme.name}
                            className="grid grid-cols-3 gap-2 w-full px-2 items-center"
                            >
                                <span className="text-left">
                                    {theme.name.charAt(0).toUpperCase() + theme.name.slice(1)}
                                </span>

                                <span className="text-center">
                                    {theme.price.toLocaleString()}
                                </span>

                                <button
                                    onClick={() => buyTheme(theme.name)}
                                    className={`w-full text-black rounded-xl transition-colors duration-100 ${
                                        userThemes.includes(theme.name)
                                            ? "bg-pink-600 cursor-default"
                                            : "bg-green-400 hover:bg-green-600 cursor-pointer"
                                    } disabled:opacity-40`}
                                    disabled={points != null && points < theme.price}
                                >
                                    {userThemes.includes(theme.name) ? "Owned" : "Buy"}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
