import { createPortal } from "react-dom"
import { useCallback, useEffect, useState } from "react"
import styles from "./modal.module.css"

export function ModalRoot({
    modal,
    closeModal
}: {
    modal: React.ReactNode
    closeModal: () => void
}) {
    const [closing, setClosing] = useState(false)

    const handleClose = useCallback(() => {
        setClosing(true) 

        setTimeout(() => {
            closeModal()
            setClosing(false)
        }, 180)
    }, [closeModal])

    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (!modal) return

            if(e.key === 'Escape') {
                handleClose()
            }
        }

        window.addEventListener('keydown', handleKey)

        return () => window.removeEventListener('keydown', handleKey)
    }, [modal, handleClose])

    if (!modal) return null

    return createPortal(
        <div className={styles.overlay} onClick={handleClose}>
            <div className={`${styles.modal} ${closing ? styles.closing : ""}`} onClick={(e) => e.stopPropagation()}>
                {modal}
            </div>
        </div>,
        document.body
    )
}