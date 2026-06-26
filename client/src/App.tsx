// import { useState } from 'react'
import Typing from './modules/typing'
import { SoundProvider } from './modules/sound/SoundContext'
import { ModalProvider } from './components/modal/ModalProvider'
import { UserProvider } from './utils/User/UserContext'
import { PointsProvider } from './modules/points/contexts/PointsContext'
import { ThemeProvider } from './utils/Theme/ThemeContext'
import { Pets } from './modules/pets'
import { PetInventoryProvider } from './modules/pets/contexts/PetInventoryContext'
import { BattleProvider } from './modules/pets/contexts/BattleContext'
import { BattleLauncher } from './modules/pets/components/BattleLauncher'

function App() {    
  // const [count, setCount] = useState(0)

  return (
    <UserProvider>
        <ThemeProvider>
            <SoundProvider>
                    <PointsProvider>
                            <PetInventoryProvider>
                            <BattleProvider>
                        <ModalProvider>
                                <div className="relative overflow-hidden min-h-screen">
                                    <Pets />
                                    <BattleLauncher />
                                    <div className="flex items-center justify-center font-mono min-h-screen p-10">
                                        <Typing />
                                    </div>
                                </div>
                        </ModalProvider>
                            </BattleProvider>
                            </PetInventoryProvider>
                    </PointsProvider>
            </SoundProvider>
        </ThemeProvider>
    </UserProvider>
  )
}

export default App
