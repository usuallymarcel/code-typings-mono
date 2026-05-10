import { createContext, useContext } from "react"

type ModalContextType = {
    openModal: (component: React.ReactNode ) => void
    isModalOpen: boolean
    closeModal: () => void
}

export const ModalContext = createContext<ModalContextType | null>(null)

export function useModal() {
    const ctx = useContext(ModalContext)

    if (!ctx) {
        throw new Error("useModal must be used inside ModalProvider")
    }

    return ctx
}