/**
 * Shared prop interface for ActivityCard sub-views.
 * Both FocusView and FeedView receive identical props from the parent orchestrator.
 */
import type { NavigateFunction } from 'react-router-dom'
import type { useLogVault } from '../../hooks/useVault'

export interface ActivityCardViewProps {
    log: any
    IS_TOUCH: boolean
    isMobile: boolean
    navigate: NavigateFunction
    openLogModal: (...args: any[]) => void

    // Endorsement
    endorsed: boolean
    endorsementCount: number
    handleEndorse: () => void
    canEndorse: boolean

    // Annotations
    annotateOpen: boolean
    handleAnnotateToggle: () => void
    canAnnotate: boolean

    // Autopsy
    autopsyOpen: boolean
    setAutopsyOpen: (v: boolean) => void

    // Dossier Export
    isExporting: boolean
    exportDossier: () => void
    dossierRef: React.RefObject<HTMLDivElement | null>

    // Ownership & Watchlist
    isOwner: boolean
    filmSaved: boolean
    addToWatchlist: (film: any) => void
    removeFromWatchlist: (filmId: number) => void

    // Lounge
    isLoungeEligible: boolean | null | undefined
    setShowShareLounge: (v: boolean) => void
    showShareLounge: boolean

    // Premium detection
    stampRotation: string
    isPremiumLog: boolean
    isAuteurLog: boolean
    isArchivistLog: boolean

    // Review text
    strippedReview: string
    showFullText: boolean
    spoilersRevealed: boolean
    setSpoilersRevealed: (v: boolean) => void
    isExpanded: boolean
    setIsExpanded: (v: boolean) => void

    // Auth
    currentUser: any

    // Utilities
    reelToast: any

    // Card click (feed only)
    handleCardClick: () => void

    // ── The Vault (the log's own page, for its owner only) ──
    /** True only on the log's own page, for the member who wrote it — by id. */
    ownsLog?: boolean
    vault?: ReturnType<typeof useLogVault>
    /** The reader holds the rank to write in the Vault (editing is offered only then). */
    canWriteVault?: boolean
}
