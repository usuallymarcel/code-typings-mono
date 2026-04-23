// import { useState } from 'react'
import Typing from './modules/typing'
import { SoundProvider } from './modules/sound/SoundContext'
import { ModalProvider } from './components/modal/ModalProvider'
import { UserProvider } from './utils/User/UserContext'

function App() {    
  // const [count, setCount] = useState(0)

  return (
    <UserProvider>
        <SoundProvider>
            <ModalProvider>
                <div className="flex items-center justify-center font-mono min-h-screen p-10">
                    <Typing/>
                </div>
            </ModalProvider>
        </SoundProvider>
    </UserProvider>
  )
}

export default App
