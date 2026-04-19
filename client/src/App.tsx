// import { useState } from 'react'
import Typing from './modules/typing'
import { SoundProvider } from './modules/sound/SoundContext'
import { ModalProvider } from './components/modal/ModalProvider'

function App() {    
  // const [count, setCount] = useState(0)

  return (
    <SoundProvider>
        <ModalProvider>
            <div className="flex max-w-500 items-center justify-center font-mono min-h-screen p-10">
                <Typing/>
            </div>
        </ModalProvider>
    </SoundProvider>
  )
}

export default App
