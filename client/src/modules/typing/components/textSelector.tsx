import { useEffect, useState } from "react"


function TextSelector( { onChange, reloadTrigger }: {onChange: (text: string) => void, reloadTrigger: number}) {
    const [textOptions, setTextOptions] = 
        useState<{id: number, name: string, text: string}[]>([])
    const [selectedId, setSelectedId] = useState<number | ''>('')

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_URL}/texts`)
            .then((res) => res.json())
            .then((data) => {
                setTextOptions(data)
            })
    }, [reloadTrigger])

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = Number(e.target.value)

        setSelectedId(id)

        const selectText = textOptions.find(t => t.id === id)
        if (selectText) {
            onChange(selectText.text)
        }
    }

    return (
    <>
        {/* {textOptions && (
            <p>{JSON.stringify(textOptions, null, 2)}</p>
        )} */}
        <select value={selectedId} onChange={e => handleChange(e)}>
            <option className="bg-neutral-800 text-white" value="">Select a text</option>

            {textOptions.map(option => (
                <option className="bg-neutral-800 text-white" key={option.id} value={option.id}>{option.name}</option>))}
        </select>

    </>
    )
}

export default TextSelector