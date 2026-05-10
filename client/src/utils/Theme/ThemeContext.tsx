import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useUser } from "../User/UserContext";

type ThemeContextType = {
    themes: string[]
    theme: string,
    changeTheme: (newTheme: string) => void,
    fetchThemes: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextType | null>(null)

type res = {
  ok: boolean,
  themes: theme[]
}

type theme = {
    theme: string,
    css: string,
    id: number
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState("dark")
    const [themes, setThemes] = useState<string[]>([])
    const { user } = useUser()

    const fetchThemes = async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/themes`, {
                credentials: "include"
            })

            const data = await res.json() as res

            if (data.ok) {
                const themeNames = data.themes.map((t) => t.theme)
                setThemes(themeNames)

                const existing = document.getElementById('dynamic-themes')

                if(existing) {
                    existing.remove()
                }

                const style = document.createElement('style')
                style.id = 'dynamic-themes'

                style.innerHTML = data.themes.map((t) => t.css || "").join('\n')

                document.head.appendChild(style)

                const saved = localStorage.getItem("theme") || themeNames[0] || "dark"

                if (themeNames.includes(saved)) {
                    setTheme(saved)
                    document.documentElement.setAttribute("data-theme", saved)
                } else {
                    setTheme(themeNames[0])
                    document.documentElement.setAttribute("data-theme", themeNames[0])
                }
            }
        } catch (err) {
            console.error("Failed to fetch themes:", err)
        }
    }

    useEffect(() => {
        fetchThemes()

        const saved = localStorage.getItem("theme") || "dark"
        setTheme(saved)
        document.documentElement.setAttribute("data-theme", saved)
    }, [user])

    const changeTheme = (newTheme: string) => {
        setTheme(newTheme)
        document.documentElement.setAttribute("data-theme", newTheme)
        localStorage.setItem("theme", newTheme)
    }

    return (
        <ThemeContext.Provider value={{ fetchThemes, themes, theme, changeTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}