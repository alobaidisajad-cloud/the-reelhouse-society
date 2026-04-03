/**
 * ActivityCard — Thin orchestrator for log cards.
 * 
 * Owns all shared state, hooks, and handlers.
 * Delegates rendering to:
 *   - FocusView (expanded cinematic layout — /log/:id)
 *   - FeedView  (compact inline layout — The Reel feed)
 */
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFilmStore, useAuthStore, useUIStore } from '../../store'
import { useViewport } from '../../hooks/useViewport'
import reelToast from '../../utils/reelToast'
import { throttleAction } from '../../errorLogger'
import FocusView from './FocusView'
import FeedView from './FeedView'

export default function ActivityCard({ log, isExpandedView = false }: { log: any, isExpandedView?: boolean }) {
    const { isTouch: IS_TOUCH, isMobile } = useViewport()
    const navigate = useNavigate()
    const { openLogModal } = useUIStore()
    const toggleEndorse = useFilmStore(state => state.toggleEndorse)
    // Memoize stamp rotation so Math.random() doesn't fire on every re-render
    const stampRotation = React.useMemo(() => `${(Math.random() * 8 - 4).toFixed(2)}deg`, [])
    // O(1) endorsement check — avoids full O(n) scan on every store tick
    const endorsedIndex = useFilmStore(state => state._endorsedIndex)
    const storeEndorsed = endorsedIndex ? !!endorsedIndex[log.id] : useFilmStore(state => state.interactions.some(i => i.targetId === log.id && i.type === 'endorse'))

    // Optimistic local state for immediate UI feedback without waiting on DB/Store tick
    const [optimisticEndorsed, setOptimisticEndorsed] = useState(storeEndorsed)
    const [endorsementCount, setEndorsementCount] = useState(log.endorsementCount ?? 0)

    // Sync if store changes externally
    useEffect(() => {
        setOptimisticEndorsed(storeEndorsed)
    }, [storeEndorsed])

    const handleEndorse = () => {
        if (!canEndorse) return reelToast.error('This dossier is locked to followers only ✦')
        throttleAction(`endorse-${log.id}`, () => {
            // Optimistic update
            setOptimisticEndorsed(!optimisticEndorsed)
            setEndorsementCount((p: number) => optimisticEndorsed ? Math.max(0, p - 1) : p + 1)
            // Background sync (rollback handled in store)
            toggleEndorse(log.id)
        })
    }

    const [isExporting, setIsExporting] = useState(false)
    const dossierRef = useRef<HTMLDivElement>(null)

    // ── ANNOTATE ──
    const [annotateOpen, setAnnotateOpen] = useState(isExpandedView)
    const { user: currentUser } = useAuthStore()
    const [showShareLounge, setShowShareLounge] = useState(false)
    const isLoungeEligible = currentUser && ['archivist', 'auteur'].includes((currentUser as any).role)

    // ── SPOILER GUARD & EXPANSION ──
    const [spoilersRevealed, setSpoilersRevealed] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [autopsyOpen, setAutopsyOpen] = useState(false)
    const showFullText = isExpandedView || isExpanded

    // ── WATCHLIST QUICK SAVE ──
    const watchlistIndex = useFilmStore(state => state._watchlistIndex)
    const addToWatchlist = useFilmStore(state => state.addToWatchlist)
    const removeFromWatchlist = useFilmStore(state => state.removeFromWatchlist)
    const filmSaved = !!watchlistIndex[log.film?.id || log.filmId]

    // ── PRIVACY ENFORCEMENT ──
    const privacyEndorsements = log.privacyEndorsements || 'everyone'
    const privacyAnnotations = log.privacyAnnotations || 'everyone'
    const isOwner = currentUser?.username === log.user
    const isFollowing = currentUser?.following?.includes(log.user)
    
    const canEndorse = isOwner || privacyEndorsements === 'everyone' || (privacyEndorsements === 'followers' && isFollowing) || log.user === 'anonymous'
    const canAnnotate = isOwner || privacyAnnotations === 'everyone' || (privacyAnnotations === 'followers' && isFollowing) || log.user === 'anonymous'

    const handleAnnotateToggle = () => {
        if (!canAnnotate) return reelToast.error('This dossier is locked to followers only ✦')
        if (!isExpandedView) {
            navigate(`/log/${log.id}`) // Take them to detail page instead of opening inline on feed
        } else {
            setAnnotateOpen(!annotateOpen)
        }
    }

    const endorsed = optimisticEndorsed

    // ── Navigation routing ──
    const handleCardClick = () => {
        if (!isExpandedView) {
            navigate(`/log/${log.id}`)
        }
    }

    const exportDossier = async () => {
        if (!dossierRef.current) return
        setIsExporting(true)
        try {
            // Give React a tick to display the hidden dossier offscreen
            await new Promise(resolve => setTimeout(resolve, 50))

            const { default: html2canvas } = await import('html2canvas')
            const canvas = await html2canvas(dossierRef.current, {
                backgroundColor: '#0a0703', // var(--ink)
                scale: 2, // High-res export
                useCORS: true,
                logging: false,
                onclone: (clonedDoc) => {
                    const el = clonedDoc.getElementById(`dossier-${log.id}`)
                    if (el) el.style.display = 'flex'
                }
            })

            const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
            const link = document.createElement('a')
            link.download = `ReelHouse-Dossier-${log.user}-${log.film?.title?.replace(/\s+/g, '-')}.jpg`
            link.href = dataUrl
            link.click()
        } catch {
            // Export failed silently — isExporting state resets in finally
        } finally {
            setIsExporting(false)
        }
    }

    // ── Premium Tier Detection (memoized — stable across re-renders) ──
    const isAuteurLog = log.userRole === 'auteur'
    const isArchivistLog = log.userRole === 'archivist'
    const hasEditorialFeatures = !!(log.editorialHeader || log.dropCap || log.pullQuote)
    const isPremiumLog = isArchivistLog || isAuteurLog || hasEditorialFeatures

    // ── Memoized stripped-HTML review text — prevents 6x regex per render ──
    const strippedReview = useMemo(() => {
        if (!log.review) return ''
        return log.review.replace(/<[^>]+>/g, '').trim()
    }, [log.review])

    // ── Shared props for both views ──
    const viewProps = {
        log, IS_TOUCH, isMobile, navigate, openLogModal,
        endorsed, endorsementCount, handleEndorse, canEndorse,
        annotateOpen, handleAnnotateToggle, canAnnotate,
        autopsyOpen, setAutopsyOpen,
        isExporting, exportDossier, dossierRef,
        isOwner, filmSaved, addToWatchlist, removeFromWatchlist,
        isLoungeEligible, setShowShareLounge, showShareLounge,
        stampRotation, isPremiumLog, isAuteurLog, isArchivistLog,
        strippedReview, showFullText, spoilersRevealed, setSpoilersRevealed,
        isExpanded, setIsExpanded,
        currentUser, reelToast, handleCardClick,
    }

    // ── DELEGATE TO APPROPRIATE VIEW ──
    if (isExpandedView) {
        return <FocusView {...viewProps} />
    }

    return <FeedView {...viewProps} />
}
