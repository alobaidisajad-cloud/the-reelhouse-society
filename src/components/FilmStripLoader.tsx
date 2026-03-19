/**
 * FilmStripLoader — A branded loading indicator styled as a 35mm film strip.
 * Replaces generic skeleton/shimmer loaders with a Nitrate Noir–branded experience.
 * Lightweight: pure CSS animation, zero JS overhead, no external dependencies.
 */
export default function FilmStripLoader({ message = 'LOADING REEL…', height = 'auto' }: { message?: string; height?: string | number }) {
  return (
    <div className="fsl" style={{ minHeight: height === 'auto' ? undefined : height }}>
      <div className="fsl-strip">
        {/* Sprocket holes — top row */}
        <div className="fsl-sprockets">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`t${i}`} className="fsl-sprocket" />
          ))}
        </div>
        {/* Film frames with shimmer */}
        <div className="fsl-frames">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`f${i}`} className="fsl-frame" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        {/* Sprocket holes — bottom row */}
        <div className="fsl-sprockets">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`b${i}`} className="fsl-sprocket" />
          ))}
        </div>
      </div>
      <div className="fsl-label">{message}</div>
    </div>
  )
}
