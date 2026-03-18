// Vercel Serverless Function — TMDB API Proxy
// Keeps the API key server-side so it never reaches the browser bundle.
// Adds edge caching for identical requests to reduce TMDB API usage.

export default async function handler(req, res) {
    const API_KEY = process.env.TMDB_API_KEY

    if (!API_KEY) {
        return res.status(500).json({ error: 'TMDB API key not configured on server' })
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { path } = req.query

    if (!path) {
        return res.status(400).json({ error: 'Missing "path" query parameter' })
    }

    // Security: only allow requests to TMDB's API base
    const TMDB_BASE = 'https://api.themoviedb.org/3'
    const separator = path.includes('?') ? '&' : '?'
    const url = `${TMDB_BASE}${path}${separator}api_key=${API_KEY}`

    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)

        const tmdbRes = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)

        if (!tmdbRes.ok) {
            return res.status(tmdbRes.status).json({ error: `TMDB returned ${tmdbRes.status}` })
        }

        const data = await tmdbRes.json()

        // Cache for 5 minutes at the edge, serve stale for 1 hour while revalidating
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
        res.setHeader('Access-Control-Allow-Origin', '*')

        return res.status(200).json(data)
    } catch (err) {
        if (err.name === 'AbortError') {
            return res.status(504).json({ error: 'TMDB request timed out' })
        }
        return res.status(502).json({ error: 'Failed to fetch from TMDB' })
    }
}
