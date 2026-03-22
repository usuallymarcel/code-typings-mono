type MeterProps = {
  percentage: number
}

export function Meter({ percentage }: MeterProps) {
  const safe = Math.min(100, Math.max(0, percentage))

  const isHot = safe > 70
  const isInsane = safe > 90

  return (
    <div className="w-full bg-neutral-800 rounded-full h-6 overflow-hidden shadow-inner">
      <div
        className={`
          h-6 rounded-full
          transition-all duration-300 ease-out
          ${isHot ? "animate-pulse" : ""}
          ${isInsane ? "shadow-[0_0_20px_5px_rgba(255,0,200,0.6)]" : ""}
        `}
        style={{
          width: `${safe}%`,
          background: `linear-gradient(
            90deg,
            
            #113811 0%,
            #206320 40%,
            #3da457 70%,
            #a1f087 100%
          )`
        }}
      >
        <span className="text-xs font-bold text-white text-center block leading-6 tracking-wider">
          {safe.toFixed(0)}%
        </span>
      </div>
    </div>
  )
}
