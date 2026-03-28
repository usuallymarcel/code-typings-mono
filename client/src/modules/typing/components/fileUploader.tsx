import React, { useEffect, useState } from 'react'

function FileUploader({ onUploadSuccess }: {onUploadSuccess: () => void}) {
    const [file, setFile] = useState<File | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [uploadDisabled, setUploadDisabled] = useState(false)

    const KILOBYTE = 1024
    const MEGABYTE = KILOBYTE * KILOBYTE
    const MAX_FILE_SIZE = KILOBYTE

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

    useEffect(() => {
        setUploadDisabled(file?.size ? file.size > MAX_FILE_SIZE : true)
    }, [file])

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
        if (size < KILOBYTE) return `${size} B`
        if (size < MEGABYTE) return `${(size / KILOBYTE).toFixed(1)} KB`
        return `${(size /(MEGABYTE)).toFixed(1)} MB`
    }

    return (
        <div className="flex-col space-y-4 border p-20 text-white bg-neutral-900 rounded-xl">
            <div>
                <label
                    htmlFor='file'
                    className="inline-block px-4 cursor-pointer rounded-xl text-center bg-pink-600 hover:bg-pink-800"
                >
                    <p >Choose text file to upload</p>
                    <input 
                        className="hidden" 
                        id="file" 
                        type="file"
                        accept=".txt"
                        onChange={handleFileChange} />
                </label>
            </div>
            {file && (
                <section className='space-y-2'>
                    File details:
                    <ul>
                        <li>Name: {file.name}</li>
                        <li>Type: {file.type ?? 'Unknown'}</li>
                        <li>Size: {formatSize(file.size)}</li>
                    </ul>
                    {file.size > MAX_FILE_SIZE && 
                        <p className="text-red-500">File too large, max size: {formatSize(MAX_FILE_SIZE)}</p>
                    }
                </section>
            )}

            {file && !uploadDisabled && (
                <button 
                className={`rounded-xl px-10 bg-emerald-600 hover:bg-emerald-800`} 
                onClick={handleUpload}
                >
                    Upload
                    </button>
            )}

            {message && (
                <p className="text-gray-400">{message}</p>
            )}
        </div>
    )
}

export default FileUploader