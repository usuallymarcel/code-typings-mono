import { OutlineButton } from "../../components/outline-button";
import { usePointsContext } from "./contexts/PointsContext";


export default function Gamble() {
    const {points, flipCoin} = usePointsContext()

    return (
        <div className='flex items-center border justify-center p-20 text-white bg-neutral-900 rounded-xl'>

        <div className="flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2">
                <p className="text-2xl font-bold">{points}</p>
                <OutlineButton onClick={() => flipCoin(true)}>Heads</OutlineButton>
                <p className="px-2">or</p>
                <OutlineButton onClick={() => flipCoin(false)}>Tails</OutlineButton>
            </div>

            
            {/* {error && <p className='text-red-500 w-50'>{error}</p>} */}
            {/* {success && <p className='text-green-500 w-50'>{success}</p>} */}
        </div>
        </div>
    )
    }