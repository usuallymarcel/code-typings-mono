import { useState } from "react"
import { useUser, type res } from "../../utils/User/UserContext"
import { useModal } from "../../components/modal/ModalContext"

type form = {
    name: string
    email?: string
    password: string
}

export default function Login() {
    const [form, setForm] = useState<form>({
        name: "",
        email: "",
        password: "",
    })

    const [isSignup, setIsSignup] = useState(false)

    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const { setUser } = useUser()

    const { closeModal } = useModal()

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({
        ...form,
        [e.target.name]: e.target.value,
        })
    }

    const validateEmail = (email: string) => {
        const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
        return regex.test(email)
    }

    const validateForm = (form: form) => {
        if (isSignup && !validateEmail(form.email || "")) {
            setError('Email must be valid')
            return false
        }

        if (form.password.length < 5) {
            setError('Password must be more than 5 characters')
            return false
        }

        if (form.name === '') {
            setError('Requires username')
            return false
        }

        return true
    }

    const submit = async () => {
        setError(null)
        if (!validateForm(form)) {
            return
        }

        try {
        const res = await fetch(`${import.meta.env.VITE_FASTAPI_API_URL}/users/${isSignup ? 'sign_up' : 'login'}`, {
            method: "POST",
            credentials: "include",
            headers: {
            "Content-Type": "application/json",
            },
            body: JSON.stringify(form),
        })

        const data = (await res.json()) as res

        if (!data.verified || !data.user) {
            throw new Error(data.message || "failed")
        }

        if (data.verified) {
            setSuccess(data.message)
            closeModal()
        }

        setUser(data.user)

        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            }
        }
    }

    return (
        <div className='flex items-center border justify-center p-20 [background:var(--bg)] rounded-xl'>

        <div className="flex flex-col gap-3">
            <div className="flex gap-2">
                <button onClick={() => setIsSignup(false)} className={`inline-block px-4 text-black rounded-xl cursor-pointer text-center transition-colors duration-100 ${ !isSignup ? 'bg-pink-600' : 'bg-gray-300'}`}>Login</button>
                <p className="px-2">or</p>
                <button onClick={() => setIsSignup(true)} className={`inline-block px-4 text-black rounded-xl cursor-pointer text-center transition-colors duration-100 ${ isSignup ? 'bg-pink-600' : 'bg-gray-300'}`}>Sign up</button>
            </div>

            <input
            type="name"
            name="name"
            placeholder="username"
            value={form.name}
            onChange={handleChange}
            />

            {isSignup && <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            />}

            <input
            type="password"
            name="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            />

            <button onClick={submit} className={`rounded-xl text-black bg-emerald-600 hover:bg-emerald-800`}>submit</button>
            
            {error && <p className='text-red-500 w-50'>{error}</p>}
            {success && <p className='text-green-500 w-50'>{success}</p>}
        </div>
        </div>
    )
    }