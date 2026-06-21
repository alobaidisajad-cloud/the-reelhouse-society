import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

/**
 * sanitize-input — Server-Side Input Sanitization
 * ─────────────────────────────────────────────────
 * Enforces input sanitization on the server to prevent 
 * client-side bypass via HTTP interception.
 * 
 * Accepts a JSON body with { text: string, type: 'username' | 'review' | 'bio' | 'list_name' }
 * and returns the sanitized + validated result.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Sanitization Rules ──
const PROFANITY_PATTERNS = [
    /\bf+u+c+k+/i, /\bs+h+i+t+/i, /\bn+i+g+/i, /\bc+u+n+t+/i,
    /\bf+a+g+/i, /\bk+i+k+e+/i, /\bw+h+o+r+e+/i,
];

function sanitizeText(text: string): string {
    return text
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Control characters
        .replace(/[\u200B-\u200D\uFEFF]/g, '')         // Zero-width chars
        .trim();
}

function sanitizeUsername(raw: string): { valid: boolean; sanitized: string; error?: string } {
    const sanitized = raw.trim().toLowerCase().replace(/\s+/g, '_');
    
    if (sanitized.length < 3) return { valid: false, sanitized, error: 'Username must be at least 3 characters.' };
    if (sanitized.length > 30) return { valid: false, sanitized, error: 'Username must be at most 30 characters.' };
    if (!/^[a-z0-9_]+$/.test(sanitized)) return { valid: false, sanitized, error: 'Username can only contain letters, numbers, and underscores.' };
    if (/__/.test(sanitized)) return { valid: false, sanitized, error: 'Username cannot contain consecutive underscores.' };
    if (PROFANITY_PATTERNS.some(p => p.test(sanitized))) return { valid: false, sanitized, error: 'Username contains prohibited language.' };
    
    return { valid: true, sanitized };
}

function sanitizeReview(raw: string): { valid: boolean; sanitized: string; error?: string } {
    const sanitized = sanitizeText(raw);
    if (sanitized.length > 5000) return { valid: false, sanitized: sanitized.slice(0, 5000), error: 'Review exceeds maximum length.' };
    return { valid: true, sanitized };
}

function sanitizeBio(raw: string): { valid: boolean; sanitized: string; error?: string } {
    const sanitized = sanitizeText(raw);
    if (sanitized.length > 160) return { valid: false, sanitized: sanitized.slice(0, 160), error: 'Bio exceeds maximum length.' };
    return { valid: true, sanitized };
}

function sanitizeListName(raw: string): { valid: boolean; sanitized: string; error?: string } {
    let sanitized = sanitizeText(raw);
    
    // Detect garbage data
    if (/^null$/i.test(sanitized)) sanitized = 'Untitled Stack';
    if (/^NULL\s+\d+/.test(sanitized)) sanitized = 'Untitled Stack';
    if (/^[0-9a-f]{8,}$/i.test(sanitized)) sanitized = 'Untitled Stack';
    if (/^[0-9]+$/.test(sanitized)) sanitized = 'Untitled Stack';
    
    if (sanitized.length > 100) return { valid: false, sanitized: sanitized.slice(0, 100), error: 'List name exceeds maximum length.' };
    return { valid: true, sanitized };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { text, type } = body as { text: string; type: string };

        if (!text || !type) {
            return new Response(JSON.stringify({ error: 'Missing text or type parameter' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        let result: { valid: boolean; sanitized: string; error?: string };

        switch (type) {
            case 'username':
                result = sanitizeUsername(text);
                break;
            case 'review':
                result = sanitizeReview(text);
                break;
            case 'bio':
                result = sanitizeBio(text);
                break;
            case 'list_name':
                result = sanitizeListName(text);
                break;
            default:
                result = { valid: true, sanitized: sanitizeText(text) };
        }

        return new Response(JSON.stringify(result), {
            status: result.valid ? 200 : 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sanitization failed';
        console.error('Sanitize Error:', message);
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
