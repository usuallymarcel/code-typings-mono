export function ConfirmPurchaseModal({isOpen, onClose, onConfirm, message }: {isOpen: boolean, onClose: () => void, onConfirm: () => void, message: string}) {
    if (!isOpen) return null

    return (
        <div className='fixed inset-0 flex items-center justify-center' onClick={onClose}>
            <div className="[background:var(--bg)] border rounded-xl p-6 min-w-60 gap-4" onClick={(e) => e.stopPropagation()}>
                <p className="my-2">{message}</p>
                <div className="flex flex-row gap-4">
                    <button className="border rounded-xl px-2 cursor-pointer" onClick={onClose}>Cancel</button>
                    <button className="border rounded-xl px-2 bg-(--button-bg) text-(--button-text) cursor-pointer" onClick={() => onConfirm()}>Confirm</button>
                </div>
            </div>
        </div>
    )
}