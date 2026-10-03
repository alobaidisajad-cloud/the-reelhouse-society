/**
 * Username validation — enforces a strict whitelist of allowed characters (Mobile Parity).
 * ─────────────────────────────────────────────────────────────────────────────
 * Rules:
 *  • 3–30 characters only
 *  • Lowercase alphanumeric + underscores only (a-z, 0-9, _)
 *  • Cannot start or end with underscore
 *  • No consecutive underscores
 *  • No slurs, vulgar words or reserved words
 *
 * The database holds the same rules (enforce_username_policy and
 * handle_is_unwelcome); a guard keeps the two word lists identical.
 */

// Reserved words that cannot be used as usernames
const RESERVED = new Set([
    'admin', 'administrator', 'mod', 'moderator', 'support', 'help',
    'reelhouse', 'system', 'root', 'official', 'staff', 'team', 'bot',
    'null', 'undefined', 'anonymous', 'anon', 'deleted', 'unknown',
    'api', 'www', 'mail', 'email', 'noreply', 'no_reply',
    'settings', 'login', 'signup', 'logout', 'feed', 'discover',
    'profile', 'edit', 'delete', 'create', 'new', 'user', 'users',
])

/**
 * Words no innocent word contains, caught anywhere inside a word of the handle,
 * with letters stretched ("fuuuck") or written as digits ("b1tch"). Never
 * across an underscore: "who_reviews" is not a word this list holds.
 */
export const UNWELCOME_ANYWHERE =
    'n+i+g+g+(e+r|a+|u+h)|f+a+g+g*o+t|w+e+t+b+a+c+k|f+u+c+k|b+i+t+c+h|w+h+o+r+e|a+s+s+h+o+l+e'

/**
 * Words that real words and names contain (Matsushita, Scunthorpe, shiitake),
 * caught only where a word of the handle begins or ends with them.
 */
export const UNWELCOME_WORD_EDGES = ['shit', 'cunt']

/** Words caught only as a whole word of the handle (a pussycat is welcome). */
export const UNWELCOME_WORDS = [
    'pussy', 'pussies', 'slut', 'sluts', 'slutty', 'retard', 'retards', 'retarded',
    'kike', 'kikes', 'spic', 'spics', 'chink', 'chinks', 'tranny', 'trannies',
]

/** Digits read as the letters they stand in for, matching only (the handle keeps its digits). */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' }

const ANYWHERE = new RegExp(UNWELCOME_ANYWHERE)

/** Is this handle (already lowercase a-z, 0-9, _) one the house refuses? */
export function isUnwelcomeHandle(handle: string): boolean {
    const read = handle.toLowerCase().replace(/[013457]/g, (d) => LEET[d])
    if (ANYWHERE.test(read)) return true
    return read.split(/[^a-z]+/).some((word) =>
        UNWELCOME_WORDS.includes(word)
        || UNWELCOME_WORD_EDGES.some((w) => word.startsWith(w) || word.endsWith(w)))
}

export interface UsernameValidation {
    valid: boolean
    error?: string
    sanitized: string
}

export function validateUsername(raw: string): UsernameValidation {
    // Sanitize: trim, lowercase, replace spaces with underscores, strip invalid chars
    const sanitized = raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')

    if (sanitized.length === 0) {
        return { valid: false, error: 'Username is required.', sanitized }
    }

    if (sanitized.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters.', sanitized }
    }

    if (sanitized.length > 30) {
        return { valid: false, error: 'Username must be 30 characters or less.', sanitized }
    }

    if (!/^[a-z0-9_]+$/.test(sanitized)) {
        return { valid: false, error: 'Only lowercase letters, numbers, and underscores allowed.', sanitized }
    }

    if (sanitized.startsWith('_') || sanitized.endsWith('_')) {
        return { valid: false, error: 'Username cannot start or end with underscore.', sanitized }
    }

    if (/__/.test(sanitized)) {
        return { valid: false, error: 'Username cannot have consecutive underscores.', sanitized }
    }

    if (RESERVED.has(sanitized)) {
        return { valid: false, error: 'This username is reserved.', sanitized }
    }

    if (isUnwelcomeHandle(sanitized)) {
        return { valid: false, error: 'This username is not allowed.', sanitized }
    }

    return { valid: true, sanitized }
}
