/**
 * useScrollReveal — IntersectionObserver hook for scroll-triggered section animations.
 * Adds 'revealed' class when element enters viewport. Pure CSS transition — no JS animation overhead.
 * Use with the .scroll-reveal CSS class from animations.css
 *
 * Usage:
 *   const ref = useScrollReveal()
 *   <section ref={ref} className="scroll-reveal">...</section>
 */
import { useEffect, useRef, useCallback } from 'react'

export function useScrollReveal(threshold = 0.15, rootMargin = '0px 0px -50px 0px') {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Skip if user prefers reduced motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('revealed')
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('revealed')
          observer.unobserve(el) // Only animate once
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return ref
}

/**
 * useScrollRevealAll — Attaches IntersectionObserver to ALL children with .scroll-reveal class
 * within a container. Use on a parent wrapper to batch-activate child reveals.
 */
export function useScrollRevealAll(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.querySelectorAll('.scroll-reveal').forEach(el => el.classList.add('revealed'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    )

    container.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [containerRef])
}
