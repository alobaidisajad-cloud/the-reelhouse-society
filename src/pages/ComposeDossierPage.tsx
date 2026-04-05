import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import reelToast from '../utils/reelToast'
import { useAuthStore, useDispatchStore } from '../store'
import { useViewport } from '../hooks/useViewport'
import PageSEO from '../components/PageSEO'
import '../styles/compose.css'
import { sanitizeHTML } from '../utils/sanitize'

/* ══════════════════════════════════════════════════════
   LIGHTWEIGHT MARKDOWN → HTML PARSER
   Handles: **bold**, *italic*, ## headings, > quotes,
   --- dividers, [links](url), paragraphs.
   Zero dependencies, ~50 lines.
   ══════════════════════════════════════════════════════ */
function parseMarkdown(md: string): string {
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

/* ── Autosave key ── */
const DRAFT_KEY = 'reelhouse_dossier_draft'
const EDIT_DRAFT_KEY = 'reelhouse_dossier_edit'

/* ══════════════════════════════════════════════════════
   THE WRITING ROOM
   Full-page dossier compose experience for Auteurs.
   ══════════════════════════════════════════════════════ */
export default function ComposeDossierPage() {
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const { addDossier, updateDossier } = useDispatchStore()
    const { isMobile } = useViewport()
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // ── State ──
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const [isPublishing, setIsPublishing] = useState(false)
    const [mobileTab, setMobileTab] = useState<'write' | 'preview'>('write')
    const [draftSaved, setDraftSaved] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)

    // ── Auth guard ──
    const canWrite = user?.role === 'auteur'

    useEffect(() => {
        if (!canWrite) {
            reelToast.error('Auteur tier required to compose dossiers')
            navigate('/dispatch', { replace: true })
        }
    }, [canWrite, navigate])

    // ── Restore draft or edit data from localStorage ──
    useEffect(() => {
        // Check if we're in edit mode
        const params = new URLSearchParams(window.location.search)
        if (params.get('edit') === 'true') {
            try {
                const editData = localStorage.getItem(EDIT_DRAFT_KEY)
                if (editData) {
                    const parsed = JSON.parse(editData)
                    setEditId(parsed.id || null)
                    setTitle(parsed.title || '')
                    setContent(parsed.content || '')
                    localStorage.removeItem(EDIT_DRAFT_KEY)
                    reelToast('Editing dossier', { icon: '✏️' })
                    return
                }
            } catch { /* ignore corrupt data */ }
        }

        // Normal draft restore
        try {
            const saved = localStorage.getItem(DRAFT_KEY)
            if (saved) {
                const draft = JSON.parse(saved)
                if (draft.title || draft.content) {
                    setTitle(draft.title || '')
                    setContent(draft.content || '')
                    reelToast('Draft restored', { icon: '📝' })
                }
            }
        } catch { /* ignore corrupt data */ }
    }, [])

    // ── Autosave every 3 seconds (debounced) — only for new dossiers ──
    const innerDraftTimerRef = useRef<NodeJS.Timeout | null>(null)
    useEffect(() => {
        if (!title && !content) return
        if (editId) return // Don't autosave edits to the draft key

        const timeout = setTimeout(() => {
            try {
                localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content }))
                setDraftSaved(true)
                if (innerDraftTimerRef.current) clearTimeout(innerDraftTimerRef.current)
                innerDraftTimerRef.current = setTimeout(() => setDraftSaved(false), 2500)
            } catch { /* storage full, ignore */ }
        }, 3000)

        return () => {
            clearTimeout(timeout)
            if (innerDraftTimerRef.current) clearTimeout(innerDraftTimerRef.current)
        }
    }, [title, content, editId])

    // ── Word count & read time ──
    const stats = useMemo(() => {
        const words = content.trim() ? content.trim().split(/\s+/).length : 0
        const chars = content.length
        const readMin = Math.max(1, Math.ceil(words / 200))
        return { words, chars, readMin }
    }, [content])

    // ── Markdown preview ──
    const previewHTML = useMemo(() => parseMarkdown(content), [content])

    // ── Insert Markdown at cursor ──
    const insertMarkdown = useCallback((before: string, after: string) => {
        const ta = textareaRef.current
        if (!ta) return

        const start = ta.selectionStart
        const end = ta.selectionEnd
        const selected = content.substring(start, end)
        const replacement = before + (selected || 'text') + after
        const newContent = content.substring(0, start) + replacement + content.substring(end)

        setContent(newContent)

        // Restore cursor position after React re-renders
        requestAnimationFrame(() => {
            ta.focus()
            const cursorPos = start + before.length + (selected ? selected.length : 4) // 4 = length of "text"
            ta.setSelectionRange(cursorPos, cursorPos)
        })
    }, [content])

    // ── Keyboard shortcuts ──
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault()
            insertMarkdown('**', '**')
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault()
            insertMarkdown('*', '*')
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            handlePublish()
        }
    }

    // ── Publish or Update ──
    const handlePublish = async () => {
        if (!title.trim() || !content.trim() || isPublishing) return

        try {
            setIsPublishing(true)

            if (editId) {
                // Update existing dossier
                await updateDossier(editId, {
                    title: title.trim(),
                    excerpt: content.trim().substring(0, 150) + (content.length > 150 ? '...' : ''),
                    fullContent: content.trim(),
                })
                reelToast.success('Dossier updated')
            } else {
                // Create new dossier
                await addDossier({
                    title: title.trim(),
                    excerpt: content.trim().substring(0, 150) + (content.length > 150 ? '...' : ''),
                    fullContent: content.trim(),
                })
                localStorage.removeItem(DRAFT_KEY)
                reelToast.success('Dossier published to The Dispatch')
            }

            navigate('/dispatch')
        } catch (err: any) {
            reelToast.error(err.message || 'Failed to publish. Try again.')
        } finally {
            setIsPublishing(false)
        }
    }

    if (!canWrite) return null

    const isReady = title.trim().length > 0 && content.trim().length > 0

    return (
        <motion.div
            className="writing-room"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <PageSEO title="Compose Dossier — The Dispatch" description="Write and publish your cinematic essay." />

            {/* ── TOP BAR ── */}
            <div className="wr-topbar">
                <div className="wr-topbar-left">
                    <button className="wr-back-btn" onClick={() => navigate('/dispatch')}>
                        ← DISPATCH
                    </button>
                    <span className="wr-topbar-title">COMPOSE DOSSIER</span>
                </div>
                <div className="wr-topbar-right">
                    <span className={`wr-draft-indicator ${draftSaved ? 'visible' : ''}`}>
                        DRAFT SAVED
                    </span>
                    <button
                        className="wr-publish-btn"
                        disabled={!isReady || isPublishing}
                        onClick={handlePublish}
                    >
                        {isPublishing ? 'TRANSMITTING…' : 'PUBLISH'}
                    </button>
                </div>
            </div>

            {/* ── MOBILE TABS ── */}
            {isMobile && (
                <div className="wr-mobile-tabs">
                    <button
                        className={`wr-mobile-tab ${mobileTab === 'write' ? 'active' : ''}`}
                        onClick={() => setMobileTab('write')}
                    >
                        ✦ WRITE
                    </button>
                    <button
                        className={`wr-mobile-tab ${mobileTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setMobileTab('preview')}
                    >
                        PREVIEW
                    </button>
                </div>
            )}

            {/* ── SPLIT PANE BODY ── */}
            <div className="wr-body">

                {/* ══ EDITOR PANE ══ */}
                <div className={`wr-editor-pane ${isMobile && mobileTab !== 'write' ? 'wr-pane-hidden' : ''}`}>

                    {/* Markdown toolbar */}
                    <div className="wr-toolbar">
                        <button className="wr-toolbar-btn" title="Bold (Ctrl+B)" onClick={() => insertMarkdown('**', '**')}>
                            <strong>B</strong>
                        </button>
                        <button className="wr-toolbar-btn" title="Italic (Ctrl+I)" onClick={() => insertMarkdown('*', '*')}>
                            <em>I</em>
                        </button>
                        <div className="wr-toolbar-divider" />
                        <button className="wr-toolbar-btn" title="Heading" onClick={() => insertMarkdown('\n## ', '\n')}>
                            H2
                        </button>
                        <button className="wr-toolbar-btn" title="Subheading" onClick={() => insertMarkdown('\n### ', '\n')}>
                            H3
                        </button>
                        <div className="wr-toolbar-divider" />
                        <button className="wr-toolbar-btn" title="Blockquote" onClick={() => insertMarkdown('\n> ', '\n')}>
                            ❝
                        </button>
                        <button className="wr-toolbar-btn" title="Divider" onClick={() => insertMarkdown('\n---\n', '')}>
                            —
                        </button>
                        <button className="wr-toolbar-btn" title="Link" onClick={() => insertMarkdown('[', '](url)')}>
                            🔗
                        </button>
                        <span className="wr-toolbar-hint">Ctrl+B bold · Ctrl+I italic · Ctrl+Enter publish</span>
                    </div>

                    {/* Title */}
                    <input
                        className="wr-title-input"
                        placeholder="Enter your headline…"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        maxLength={200}
                        autoFocus={!isMobile}
                    />

                    {/* Content */}
                    <textarea
                        ref={textareaRef}
                        className="wr-content-area"
                        placeholder="Begin your dossier…&#10;&#10;Use **bold** and *italic* for emphasis.&#10;Use > for blockquotes.&#10;Use ## for section headings."
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                {/* ══ PREVIEW PANE ══ */}
                <div className={`wr-preview-pane ${isMobile && mobileTab !== 'preview' ? 'wr-pane-hidden' : ''}`}>
                    <div className="wr-preview-label">
                        <span>LIVE PREVIEW</span>
                        <span style={{ opacity: 0.5 }}>{stats.words} WORDS</span>
                    </div>
                    <div className="wr-preview-content">
                        {(title.trim() || content.trim()) ? (
                            <>
                                {title.trim() && (
                                    <div className="preview-title">{title}</div>
                                )}
                                {content.trim() && (
                                    <div
                                        className="preview-body"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHTML(previewHTML) }}
                                    />
                                )}
                            </>
                        ) : (
                            <div className="wr-preview-empty">
                                <div className="wr-preview-empty-icon">✎</div>
                                <div className="wr-preview-empty-text">
                                    YOUR DOSSIER WILL<br />APPEAR HERE
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* ── BOTTOM PUBLISH BAR ── */}
            <div className="wr-stats-bar">
                <div className="wr-stats-left">
                    <span className="wr-stat">
                        WORDS <span className="wr-stat-value">{stats.words}</span>
                    </span>
                    <span className="wr-stat">
                        CHARACTERS <span className="wr-stat-value">{stats.chars.toLocaleString()}</span>
                    </span>
                    <span className="wr-stat">
                        READ TIME <span className="wr-stat-value">~{stats.readMin} MIN</span>
                    </span>
                </div>
                <button
                    className="wr-publish-btn"
                    disabled={!isReady || isPublishing}
                    onClick={handlePublish}
                >
                    {isPublishing ? 'TRANSMITTING…' : editId ? '✦ UPDATE DOSSIER' : '✦ PUBLISH DOSSIER'}
                </button>
            </div>
        </motion.div>
    )
}
