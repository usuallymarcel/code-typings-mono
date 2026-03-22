// import { useState } from 'react'
import Typing from './modules/typing'
import { SoundProvider } from './modules/sound/SoundContext'

function App() {
  // const [count, setCount] = useState(0)

  return (
    <SoundProvider>
      <Typing/>
    </SoundProvider>
  )
}

export default App
