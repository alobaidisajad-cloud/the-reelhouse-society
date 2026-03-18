import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { tmdb } from '../tmdb'

/**
 * INTELLIGENCE PROTOCOL: DYNAMIC OPEN-GRAPH & SEO
 * This hooks into route changes to update the <head> metadata for search engines
 * that execute Javascript (Google, Bing).
 * NOTE: For fully static crawlers (Twitter/iMessage), a Vercel/Netlify Edge 
 * function must be deployed to intercept the initial HTML request.
 */
export function useSEOSync(customTitle: any, description: any, ogImage: any) {
    useEffect(() => {
        // Build Base Title
        const base = "The ReelHouse Society — Track, Discover, and Live Cinema"
        document.title = customTitle ? `${customTitle} | The ReelHouse Society` : base

        // Safely update Meta Tags
        const setMeta = (property: any, content: any) => {
            if (!content) return;
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

        if (description) setMeta('description', description)
        if (description) setMeta('og:description', description)
        if (customTitle) setMeta('og:title', customTitle)
        if (ogImage) setMeta('og:image', ogImage)

    }, [customTitle, description, ogImage])
}
