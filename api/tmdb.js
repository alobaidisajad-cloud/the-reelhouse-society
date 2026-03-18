// Vercel Edge Function — TMDB API Proxy
// Keeps the API key server-side so it never reaches the browser bundle.
// Runs on Vercel's Edge Runtime for ultra-fast global responses.

export const config = { runtime: 'edge' }

export default async function handler(request) {
    const API_KEY = process.env.TMDB_API_KEY

    if (!API_KEY) {
        return new Response(
            JSON.stringify({ error: 'TMDB API key not configured on server' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { 'Content-Type': 'application/json' } }
        )
    }

    const url = new URL(request.url)
    const path = url.searchParams.get('path')

    if (!path) {
        return new Response(
            JSON.stringify({ error: 'Missing "path" query parameter' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
    }

    // Security: only allow requests to TMDB's API base
    const TMDB_BASE = 'https://api.themoviedb.org/3'
    const separator = path.includes('?') ? '&' : '?'
    const tmdbUrl = `${TMDB_BASE}${path}${separator}api_key=${API_KEY}`

    try {
        const tmdbRes = await fetch(tmdbUrl, { signal: AbortSignal.timeout(10000) })

        if (!tmdbRes.ok) {
            return new Response(
                JSON.stringify({ error: `TMDB returned ${tmdbRes.status}` }),
                { status: tmdbRes.status, headers: { 'Content-Type': 'application/json' } }
            )
        }

        const data = await tmdbRes.json()

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 's-maxage=300, stale-while-revalidate=3600',
                'Access-Control-Allow-Origin': '*',
            },
        })
    } catch (err) {
        if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            return new Response(
                JSON.stringify({ error: 'TMDB request timed out' }),
                { status: 504, headers: { 'Content-Type': 'application/json' } }
            )
        }
        return new Response(
            JSON.stringify({ error: 'Failed to fetch from TMDB' }),
            { status: 502, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
