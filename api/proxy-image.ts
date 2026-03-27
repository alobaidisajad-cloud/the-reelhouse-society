// Vercel Edge Function: /api/proxy-image
// Proxies TMDB CDN images server-side so the browser can fetch them as Blob
// without hitting CORS restrictions, enabling html2canvas to render them.
export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
    const { searchParams } = new URL(req.url)
    const imageUrl = searchParams.get('url')

    // Only allow proxying from TMDB's image CDN
    if (!imageUrl || !imageUrl.startsWith('https://image.tmdb.org/')) {
        return new Response('Forbidden', { status: 403 })
    }

    try {
        const upstream = await fetch(imageUrl, {
            headers: { 'User-Agent': 'ReelHouse/1.0' },
        })

        if (!upstream.ok) {
            return new Response('Not found', { status: upstream.status })
        }

        const blob = await upstream.arrayBuffer()
        const contentType = upstream.headers.get('Content-Type') || 'image/jpeg'

        return new Response(blob, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
            },
        })
    } catch {
        return new Response('Proxy error', { status: 502 })
    }
}
