// Vercel Serverless Function — TMDB API Proxy
// Keeps the API key server-side so it never reaches the browser bundle.
// Adds edge caching for identical requests to reduce TMDB API usage.

export function GET(request) {
    const API_KEY = process.env.TMDB_API_KEY

    if (!API_KEY) {
        return Response.json({ error: 'TMDB API key not configured on server' }, { status: 500 })
    }

    const url = new URL(request.url)
    const path = url.searchParams.get('path')

    if (!path) {
        return Response.json({ error: 'Missing "path" query parameter' }, { status: 400 })
    }

    // Security: only allow requests to TMDB's API base
    const TMDB_BASE = 'https://api.themoviedb.org/3'
    const separator = path.includes('?') ? '&' : '?'
    const tmdbUrl = `${TMDB_BASE}${path}${separator}api_key=${API_KEY}`

    return fetch(tmdbUrl, { signal: AbortSignal.timeout(10000) })
        .then(async (tmdbRes) => {
            if (!tmdbRes.ok) {
                return Response.json(
                    { error: `TMDB returned ${tmdbRes.status}` },
                    { status: tmdbRes.status }
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
        })
        .catch((err) => {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                return Response.json({ error: 'TMDB request timed out' }, { status: 504 })
            }
            return Response.json({ error: 'Failed to fetch from TMDB' }, { status: 502 })
        })
}
