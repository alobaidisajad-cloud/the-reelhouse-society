export default async function handler(req, res) {
    const { type, id } = req.query;
    
    // Automatically pick up Vercel environment variables injected during the build
    const token = process.env.VITE_TMDB_READ_URL; // Using Bearer if present
    const apiKey = process.env.VITE_TMDB_API_KEY; 

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
    let url = `https://thereelhouse.io/${type}/${id}`;
    let isFound = false;

    // TMDB Interceptor
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

    // Generate raw HTML with injected OG meta tags
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description.replace(/"/g, '&quot;')}">
    
    <!-- Open Graph / Facebook / iMessage -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:title" content="${title.replace(/"/g, '&quot;')}">
    <meta property="og:description" content="${description.replace(/"/g, '&quot;')}">
    <meta property="og:image" content="${imageUrl}">

    <!-- Twitter / Discord / Slack -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${url}">
    <meta property="twitter:title" content="${title.replace(/"/g, '&quot;')}">
    <meta property="twitter:description" content="${description.replace(/"/g, '&quot;')}">
    <meta property="twitter:image" content="${imageUrl}">
</head>
<body>
    <h1>${title}</h1>
    <p>${description}</p>
    <img src="${imageUrl}" alt="Preview" />
</body>
</html>`;

    // Emit Header Directives
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache the dynamic HTML at the Vercel CDN Edge for 24 hours to eliminate repeating TMDB RTTs
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200'); 
    
    res.status(200).send(html);
}
