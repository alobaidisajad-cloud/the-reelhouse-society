/**
 * Username validation — enforces a strict whitelist of allowed characters.
 * ─────────────────────────────────────────────────────────────────────────────
 * Rules:
 *  • 3–30 characters only
 *  • Lowercase alphanumeric + underscores only (a-z, 0-9, _)
 *  • Cannot start or end with underscore
 *  • No consecutive underscores
 *  • No profanity or reserved words
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

// Basic profanity patterns — catches obvious variations
const PROFANITY_PATTERNS = [
    /f+u+c+k/i, /s+h+i+t/i, /a+s+s+h+o+l+e/i, /b+i+t+c+h/i,
    /d+i+c+k/i, /p+u+s+s+y/i, /c+u+n+t/i, /n+i+g+g/i,
    /f+a+g+g/i, /r+e+t+a+r+d/i, /w+h+o+r+e/i, /s+l+u+t/i,
]

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

    if (PROFANITY_PATTERNS.some(p => p.test(sanitized))) {
        return { valid: false, error: 'This username is not allowed.', sanitized }
    }

    return { valid: true, sanitized }
}
