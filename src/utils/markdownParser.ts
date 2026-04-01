/* ══════════════════════════════════════════════════════
   LIGHTWEIGHT MARKDOWN → HTML PARSER
   Handles: **bold**, *italic*, ## headings, > quotes,
   --- dividers, [links](url), paragraphs.
   Zero dependencies.
   ══════════════════════════════════════════════════════ */

/** Inline formatting: **bold**, *italic*, [link](url) */
function inlineFormat(text: string): string {
    return text
        // Escape HTML
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Bold: **text**
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Italic: *text*
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Links: [text](url)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

export function parseMarkdown(md: string): string {
    if (!md.trim()) return ''

    return md
        .split('\n\n') // Split into blocks (paragraphs)
        .map(block => {
            const trimmed = block.trim()
            if (!trimmed) return ''

            // Horizontal rule
            if (/^---+$/.test(trimmed)) return '<hr />'

            // Headings
            if (trimmed.startsWith('### ')) return `<h3>${inlineFormat(trimmed.slice(4))}</h3>`
            if (trimmed.startsWith('## ')) return `<h2>${inlineFormat(trimmed.slice(3))}</h2>`

            // Blockquote (handle multi-line)
            if (trimmed.startsWith('> ')) {
                const quoteText = trimmed.split('\n')
                    .map(l => l.replace(/^>\s?/, ''))
                    .join('<br/>')
                return `<blockquote>${inlineFormat(quoteText)}</blockquote>`
            }

            // Regular paragraph (may contain line breaks)
            const lines = trimmed.split('\n').map(l => inlineFormat(l)).join('<br/>')
            return `<p>${lines}</p>`
        })
        .filter(Boolean)
        .join('\n')
}
