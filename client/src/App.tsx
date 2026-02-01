// import { useState } from 'react'
import Typing from './components/typing'
import { SoundProvider } from './context/SoundContext'

function App() {
  // const [count, setCount] = useState(0)

  return (
    <SoundProvider>
      <Typing/>
    </SoundProvider>
  )
}

export default App
