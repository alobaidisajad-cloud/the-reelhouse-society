import { useEffect } from 'react'

/**
 * INTELLIGENCE PROTOCOL: DYNAMIC OPEN-GRAPH & SEO
 * Updates <head> metadata on route changes for search engines that execute JS.
 * Also injects JSON-LD structured data for rich Google snippets.
 * NOTE: For fully static crawlers (Twitter/iMessage), a Vercel Edge function
 * would be needed to intercept the initial HTML request.
 */

interface SEOSyncOptions {
    /** JSON-LD structured data object to inject */
    jsonLd?: Record<string, unknown>
}

export function useSEOSync(customTitle?: string, description?: string, ogImage?: string, options?: SEOSyncOptions) {
    useEffect(() => {
        const base = "The ReelHouse Society — Track, Discover, and Live Cinema"
        document.title = customTitle ? `${customTitle} | The ReelHouse Society` : base

        const setMeta = (property: string, content: string) => {
            if (!content) return
            const element = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`)
            if (element) {
                element.setAttribute('content', content)
            } else {
                const newTag = document.createElement('meta')
                newTag.setAttribute(property.includes('og:') ? 'property' : 'name', property)
                newTag.setAttribute('content', content)
                document.head.appendChild(newTag)
            }
        }

        if (description) {
            setMeta('description', description)
            setMeta('og:description', description)
            setMeta('twitter:description', description)
        }
        if (customTitle) {
            setMeta('og:title', customTitle)
            setMeta('twitter:title', customTitle)
        }
        if (ogImage) {
            setMeta('og:image', ogImage)
            setMeta('twitter:image', ogImage)
        }

        // ── JSON-LD Structured Data — makes Google show rich snippets ──
        // Remove any previous JSON-LD we injected
        const oldScript = document.querySelector('script[data-rh-jsonld]')
        if (oldScript) oldScript.remove()

        if (options?.jsonLd) {
            const script = document.createElement('script')
            script.type = 'application/ld+json'
            script.setAttribute('data-rh-jsonld', 'true')
            script.textContent = JSON.stringify(options.jsonLd)
            document.head.appendChild(script)
        }

        // Cleanup on unmount — restore defaults & remove JSON-LD
        return () => {
            document.title = base
            const injectedLd = document.querySelector('script[data-rh-jsonld]')
            if (injectedLd) injectedLd.remove()
        }
    }, [customTitle, description, ogImage, options?.jsonLd])
}
