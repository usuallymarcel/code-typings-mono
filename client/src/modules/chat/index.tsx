import { useEffect, useRef, useState } from 'react'
import { serverUrl } from '../../utils/env'
import { useUser } from '../../utils/User/UserContext'
import { useLeaderboard } from '../leaderboard/hooks/useLeaderboard'

const server =
  window.location.href.includes('localhost')
    ? serverUrl
    : window.location.origin

const wsUrl = server.replace(/^http/, 'ws')

type Message = {
    content: string
    sender_name: string
    time: string
}

type wsRes = Message & { type: string }

type ApiMessage = {
    sender_name: string
    content: string
    created_at: string
    id: number
}

type res = {
    ok: boolean
    messages: ApiMessage[]
}

export default function Chat() {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const socketRef = useRef<WebSocket | null>(null)

    const { leaderboard } = useLeaderboard({ selected: 10 })

    const rankMap = new Map<string, number>()

    leaderboard?.forEach((entry, index) => {
        rankMap.set(entry.user.name, index + 1)
    })

    const { user } = useUser() 

    const pushMessage = (newMessage: Message) => {
            setMessages((prev) => {
            const updated = [...prev, newMessage]
            return updated.slice(-10)
        })
    }

    const getNameColor = (username: string) => {
        const rank = rankMap.get(username)

        if (rank === 1) return 'text-yellow-400'
        if (rank === 2) return 'text-blue-300'
        if (rank === 3) return 'text-orange-400'

        return ''
    }

    const fetchMessages = async () => {
        const res = await fetch(`${serverUrl}/messages?take=10`)
        const data = await res.json() as res

        const formatted = data.messages.map((m) => ({
            content: m.content,
            sender_name: m.sender_name,
            time: m.created_at,
        }))

        setMessages(formatted.slice(-10))
    }

    useEffect(() => {
        fetchMessages()
            const socket = new WebSocket(`${wsUrl}/ws/chat`)
            socketRef.current = socket

            socket.onopen = () => {
            console.log('connected')
        }

        socket.onmessage = (event) => {
            const payload = JSON.parse(event.data) as wsRes

            if (payload.type === 'message') {

                pushMessage({
                    content: payload.content,
                    sender_name: payload.sender_name,
                    time: payload.time,
                })
            }
        }

        socket.onclose = () => {
        console.log('disconnected')
        }

        return () => socket.close()
    }, [])

    const sendMessage = () => {
        if (!input.trim() || !socketRef.current) return

        const messagePayload = {
            type: 'message',
            content: input,
        }

        socketRef.current.send(JSON.stringify(messagePayload))
        setInput('')
    }

    return (
        <div className="flex flex-col h-100 p-4 text-white bg-neutral-900 rounded-xl border">
        <h3 className="mb-2 underline">Global Chat:</h3>

        <div className="flex-1 overflow-y-scroll space-y-2 mb-3">
            {messages.map((m, i) => (
            <div key={i}>
                <strong className={getNameColor(m.sender_name)}>{m.sender_name}:</strong> {m.content}
            </div>
            ))}
        </div>

        <div className="flex gap-2">
            <input
            className="flex-1 p-2 rounded disabled:opacity-40"
            value={input}
            disabled={!user}
            onChange={(e) => setInput(e.target.value)}
            placeholder={user ? "Type a message..." : "Must be logged in"}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    sendMessage()
                }
            }}
            />
            <button
            onClick={sendMessage}
            disabled={!user}
            className="px-4 py-2 border rounded disabled:opacity-40"
            >
            Send
            </button>
        </div>
        </div>
    )
}