// HTML entity-encode every dynamic value before interpolation.
// Covers attribute and text contexts (escapes & < > " ').
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
    // ── Strict input validation ──
    // `type` and `id` are client-controlled and get reflected into the HTML
    // response served from the app origin. Allowlist them so nothing
    // unexpected is ever reflected: `type` must be a known route, `id` must be
    // a positive integer (TMDB ids are always numeric). Anything else degrades
    // to the safe generic card instead of echoing raw input.
    const type = (req.query.type === 'film' || req.query.type === 'person') ? req.query.type : null;
    const id = /^\d+$/.test(String(req.query.id ?? '')) ? String(req.query.id) : null;

    // This file runs as a Vercel serverless function, so `process.env` is read at
    // request time on the server — nothing here is inlined into any browser bundle.
    // Using the TMDB credentials directly is therefore correct here, unlike in
    // src/, which must go through the tmdb-proxy edge function.
    //
    // ⚠️ Both names below carry the `VITE_` prefix, which is this project's marker
    // for "safe to ship to the browser" — and VITE_TMDB_READ_URL is not a URL, it is
    // a TMDB v4 Bearer token. The day anyone writes `import.meta.env.VITE_TMDB_READ_URL`
    // in a component, Vite inlines it into the bundle silently, with no error. That is
    // exactly how the v3 key got published.
    //
    // Each is read under an unprefixed name FIRST, so the Vercel dashboard variables
    // can be renamed to TMDB_READ_TOKEN / TMDB_API_KEY whenever convenient. Until
    // then the old names keep working, so the rename can never half-break this.
    const token = process.env.TMDB_READ_TOKEN || process.env.VITE_TMDB_READ_URL;
    const apiKey = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;

    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    };

    let title = 'ReelHouse';
    let description = 'Discover, log, and review your cinematic life.';
    let imageUrl = 'https://thereelhouse.io/icon-512.png'; // High-res fallback logo
    // url is built ONLY from validated values — never from raw query input.
    let url = (type && id) ? `https://thereelhouse.io/${type}/${id}` : 'https://thereelhouse.io';
    let isFound = false;

    // TMDB Interceptor — only runs for validated type+id
    try {
        if (type === 'film' && id) {
            const endpoint = apiKey
                ? `https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=en-US`
                : `https://api.themoviedb.org/3/movie/${id}?language=en-US`;

            const tmdbRes = await fetch(endpoint, options);
            const data = await tmdbRes.json();

            if (data.title) {
                isFound = true;
                const year = data.release_date ? data.release_date.split('-')[0] : '';
                title = `${data.title} ${year ? `(${year})` : ''} — ReelHouse`;
                description = data.overview || description;

                // Prioritize the gorgeous 16:9 Backdrop for Twitter/Discord cards
                if (data.backdrop_path) {
                    imageUrl = `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`;
                } else if (data.poster_path) {
                    imageUrl = `https://image.tmdb.org/t/p/w780${data.poster_path}`;
                }
            }
        }
        else if (type === 'person' && id) {
            const endpoint = apiKey
                ? `https://api.themoviedb.org/3/person/${id}?api_key=${apiKey}&language=en-US`
                : `https://api.themoviedb.org/3/person/${id}?language=en-US`;

            const tmdbRes = await fetch(endpoint, options);
            const data = await tmdbRes.json();

            if (data.name) {
                isFound = true;
                title = `${data.name} on ReelHouse`;
                description = data.biography ? data.biography.substring(0, 200) + '...' : `Explore the cinematic history of ${data.name}.`;
                if (data.profile_path) {
                    imageUrl = `https://image.tmdb.org/t/p/w780${data.profile_path}`;
                }
            }
        }
    } catch (err) {
        console.error('OG generation failed:', err);
    }

    if (!isFound) {
        title = 'ReelHouse | The Cinema Society';
    }

    // ── Escape EVERY dynamic value at the sink ──
    // Both client-derived (url) and third-party (TMDB title/overview/name/bio,
    // which is community-editable) content is entity-encoded. There is no
    // unescaped interpolation path below.
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safeImageUrl = escapeHtml(imageUrl);
    const safeUrl = escapeHtml(url);

    // Generate raw HTML with injected OG meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">

    <!-- Open Graph / Facebook / iMessage -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${safeUrl}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:image" content="${safeImageUrl}">

    <!-- Twitter / Discord / Slack -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${safeUrl}">
    <meta property="twitter:title" content="${safeTitle}">
    <meta property="twitter:description" content="${safeDescription}">
    <meta property="twitter:image" content="${safeImageUrl}">
</head>
<body>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <img src="${safeImageUrl}" alt="Preview" />
</body>
</html>`;

    // Emit Header Directives
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache the dynamic HTML at the Vercel CDN Edge for 7 DAYS to protect against viral social scrapers/DDoS
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');

    res.status(200).send(html);
}
