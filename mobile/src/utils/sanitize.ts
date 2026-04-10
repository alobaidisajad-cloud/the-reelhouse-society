/**
 * Sanitize user-facing text to remove competitor branding,
 * clean up broken import artifacts, and clean titles (Mobile Parity).
 */

const COMPETITOR_NAMES = [
    'Letterboxd', 'letterboxd',
    'IMDb', 'imdb', 'IMDB',
    'Trakt', 'trakt',
    'Rotten Tomatoes',
    'Metacritic',
    'Flixster',
    'Criticker',
]

const IMPORT_PHRASES = [
    /imported\s+from\s+\S+/gi,
    /migrated\s+from\s+\S+/gi,
    /transferred\s+from\s+\S+/gi,
    /synced\s+from\s+\S+/gi,
    /exported\s+from\s+\S+/gi,
]

/**
 * Removes competitor references and import labels from descriptions.
 * If the entire description is just an import label, returns empty string.
 */
export function sanitizeDescription(desc: string | null | undefined): string {
    if (!desc || !desc.trim()) return ''

    let cleaned = desc.trim()

    // Remove import phrases entirely
    for (const pattern of IMPORT_PHRASES) {
        cleaned = cleaned.replace(pattern, '').trim()
    }

    // Remove standalone competitor name mentions
    for (const name of COMPETITOR_NAMES) {
        // Only remove if it appears as a standalone reference, not inside a word
        const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
        cleaned = cleaned.replace(regex, '').trim()
    }

    // Clean up any leftover punctuation artifacts
    cleaned = cleaned
        .replace(/^\s*[—–-]\s*/, '')    // Leading dashes
        .replace(/\s*[—–-]\s*$/, '')    // Trailing dashes
        .replace(/^\s*[·•]\s*/, '')      // Leading bullets
        .replace(/\s{2,}/g, ' ')         // Multiple spaces
        .trim()

    return cleaned
}

/**
 * Cleans list titles — replaces NULL/broken entries with a fallback.
 */
export function sanitizeListTitle(title: string | null | undefined): string {
    if (!title || !title.trim()) return 'Untitled Stack'

    const trimmed = title.trim()

    // Detect broken titles: "NULL", "null", raw numeric IDs, UUID-like strings
    if (/^null$/i.test(trimmed)) return 'Untitled Stack'
    if (/^NULL\s+\d+/.test(trimmed)) return 'Untitled Stack'
    if (/^[0-9a-f]{8,}$/i.test(trimmed)) return 'Untitled Stack'
    if (/^[0-9]+$/.test(trimmed)) return 'Untitled Stack'

    return trimmed
}
