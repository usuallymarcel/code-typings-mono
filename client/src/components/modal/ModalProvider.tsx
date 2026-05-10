import { useState } from "react"
import { ModalContext } from "./ModalContext"
import { ModalRoot } from "./ModalRoot"

export function ModalProvider({ children }: { children: React.ReactNode }) {
    const [modal, setModal] = useState<React.ReactNode>(null)

    function openModal(component: React.ReactNode) {
        setModal(component)
    }

    function closeModal() {
        setModal(null)
    }

    return (
        <ModalContext.Provider value={{ openModal, closeModal, isModalOpen: modal !== null }}>
            {children}
            <ModalRoot modal={modal} closeModal={closeModal} />
        </ModalContext.Provider>
    )
}