import { createContext, useContext, useEffect, useState } from "react"

export type User = {
    id: number
    name: string
    email: string
}

type UserContextType = {
    user: User | null
    loading: boolean
    setUser: (user: User | null) => void
    logout: () => Promise<void>
}

export type res = {
    verified: boolean
    message: string
    user?: User
}

const UserContext = createContext<UserContextType | null>(null)

export function UserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/users/check_session`, {
                    credentials: "include"
                })

                const data = await res.json() as res

                if (data.verified && data.user) {
                    setUser(data.user)
                } else {
                    setUser(null)
                }
            } catch {
                setUser(null)
            } finally {
                setLoading(false)
            }
        }

        fetchUser()
    }, [])

    const logout = async () => {
        try {
            await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/users/logout`, {
                method: "POST",
                credentials: "include"
            })
        } catch (error) {
            console.error("Logout failed", error)
        } finally {
            setUser(null)
        }
    }

    return (
        <UserContext.Provider value={{ user, loading, setUser, logout }}>
            {children}
        </UserContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
    const context = useContext(UserContext)
    if (!context) {
        throw new Error('useUser must be used within a UserProvider')
    }
    return context
}