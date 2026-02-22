import React, { useState } from 'react'

function FileUploader({ onUploadSuccess }: {onUploadSuccess: () => void}) {
    const [file, setFile] = useState<File | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return



        if (e.target.files[0].type === 'text/plain') {
            setFile(e.target.files[0])
            setMessage(null)
        } else {
            setFile(null)
            setMessage('Incorrect file type')
        }
    }

    async function handleUpload() {
        if (!file) return

        const formData = new FormData()

        formData.append('file', file)

        try {
            const uploadRes = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
                method: 'POST',
                body: formData
            })


            const data = await uploadRes.json()
            
            if (!uploadRes.ok) {
                setMessage(data.message ?? "failed to upload file")
            } else {
                onUploadSuccess()
                setMessage(data.message ?? 'upload successful I think')
            }

            setFile(null)

            setTimeout(() => {
                setMessage(null)
            }, 3000)
        } catch (error) {
            setMessage((error as Error).message ?? 'failed to upload file' )
        }
    }

    function formatSize(size: number) {
        if (size < 1024) return `${size} B`
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
        return `${(size /(1024 * 1024)).toFixed(1)} MB`
    }

    return (
        <>
            <div>
                <label
                    htmlFor='file'
                    className="block cursor-pointer rounded-xl max-w-35 my-4 text-center bg-gray-500 hover:bg-gray-600"
                >
                    <p >Choose file</p>
                    <input 
                        className="hidden" 
                        id="file" 
                        type="file"
                        accept=".txt"
                        onChange={handleFileChange} />
                </label>
            </div>
            {file && (
                <section>
                    File details:
                    <ul>
                        <li>Name: {file.name}</li>
                        <li>Type: {file.type ?? 'Unknown'}</li>
                        <li>Size: {formatSize(file.size)}</li>
                    </ul>
                </section>
            )}

            {file && (
                <button 
                className="rounded-xl p-1 px-4 my-4 min-w-35 bg-green-500 hover:bg-green-600" 
                onClick={handleUpload}>
                    Upload
                    </button>
            )}

            {message && (
                <p className="my-2 text-gray-400">{message}</p>
            )}
        </>
    )
}

export default FileUploader