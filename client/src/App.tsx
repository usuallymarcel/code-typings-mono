// import { useState } from 'react'
import Typing from './modules/typing'
import { SoundProvider } from './modules/sound/SoundContext'
import { ModalProvider } from './components/modal/ModalProvider'
import { UserProvider } from './utils/User/UserContext'
import { PointsProvider } from './modules/points/contexts/PointsContext'
import { ThemeProvider } from './utils/Theme/ThemeContext'
import { PetLayer } from './modules/pets/components/PetLayer'

function App() {    
  // const [count, setCount] = useState(0)

  return (
    <UserProvider>
        <ThemeProvider>
            <SoundProvider>
                    <PointsProvider>
                        <ModalProvider>
                            <div className="relative overflow-hidden min-h-screen">
                                <PetLayer />

                                <div className="flex items-center justify-center font-mono min-h-screen p-10">
                                    <Typing />
                                </div>
                            </div>
                        </ModalProvider>
                    </PointsProvider>
            </SoundProvider>
        </ThemeProvider>
    </UserProvider>
  )
}

export default App
