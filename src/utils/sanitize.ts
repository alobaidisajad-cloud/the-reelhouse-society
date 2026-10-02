/**
 * Keeps user-generated HTML safe to render (XSS). A member's words are
 * otherwise shown as they wrote them.
 */
import DOMPurify from 'dompurify'

/** Sanitize user-generated HTML, allowing only safe formatting tags. Prevents XSS. */
export function sanitizeHTML(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'img', 'figure', 'figcaption', 'hr'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style', 'src', 'alt', 'width', 'height'],
        ALLOW_DATA_ATTR: false,
    })
}
