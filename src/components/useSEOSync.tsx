import { useEffect } from 'react'

/**
 * INTELLIGENCE PROTOCOL: DYNAMIC OPEN-GRAPH & SEO
 * Updates <head> metadata on route changes for search engines that execute JS.
 * NOTE: For fully static crawlers (Twitter/iMessage), a Vercel Edge function
 * would be needed to intercept the initial HTML request.
 */
export function useSEOSync(customTitle?: string, description?: string, ogImage?: string) {
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
    }, [customTitle, description, ogImage])
}

