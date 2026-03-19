/**
 * ProgressiveImage — Blur-up loading for film posters.
 * Shows a tiny w92 placeholder with CSS blur, then swaps in the full image.
 * Pure CSS transition — no JS overhead after initial render.
 */
import { useState, useCallback } from 'react'

interface ProgressiveImageProps {
  src?: string
  thumbSrc?: string
  srcSet?: string
  sizes?: string
  alt: string
  style?: React.CSSProperties
  className?: string
}

export default function ProgressiveImage({ src, thumbSrc, srcSet, sizes, alt, style, className }: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false)
  const onLoad = useCallback(() => setLoaded(true), [])

  if (!src) return null

  return (
    <div className={`progressive-img-wrap ${className || ''}`} style={{ position: 'relative', overflow: 'hidden', ...style }}>
      {/* Tiny blurred placeholder — loads instantly from cache */}
      {thumbSrc && !loaded && (
        <img
          src={thumbSrc}
          alt=""
          aria-hidden
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', filter: 'blur(20px) saturate(0.6) sepia(0.3)',
            transform: 'scale(1.1)', /* hide blur edges */
          }}
        />
      )}
      {/* Full image — fades in when loaded */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={onLoad}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />
    </div>
  )
}
