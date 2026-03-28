import { Suspense, lazy, useEffect, useState, useMemo } from 'react'
import { Routes, Route, useLocation, Link, Navigate, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { tmdb } from './tmdb'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Preloader from './components/Preloader'
import FilmStripLoader from './components/FilmStripLoader'
import CustomCursor from './components/CustomCursor'
import { useFilmStore, useUIStore, useAuthStore, initRealtime, initAuthSync } from './store'
import InstallPrompt from './components/InstallPrompt'
import QualityOfLife from './components/QualityOfLife'
import ErrorBoundary from './components/ErrorBoundary'
import BottomNav from './components/BottomNav'
import OfflineBanner from './components/OfflineBanner'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import ShortcutsHelp from './components/ShortcutsHelp'
import { useAnalytics } from './hooks/useAnalytics'
import { useAchievements } from './hooks/useAchievements'
import AchievementToast from './components/AchievementToast'

// ── Heavy Global Modals (Lazy Loaded) ──
// BootcampModal retired — onboarding content lives in the Handbook now
const PaywallModal = lazy(() => import('./components/PaywallModal'))
const LogModal = lazy(() => import('./components/LogModal'))
const SignupModal = lazy(() => import('./components/SignupModal'))
const HandbookModal = lazy(() => import('./components/HandbookModal'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const OnboardingModal = lazy(() => import('./components/OnboardingModal'))
const CSVImport = lazy(() => import('./components/CSVImport'))

import { useViewport } from './hooks/useViewport'


// Detect prefers-reduced-motion — used to disable Framer Motion animations
const PREFERS_REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Route-level code splitting — pages load on demand, not all at once ──
const HomePage = lazy(() => import('./pages/HomePage'))
const FilmDetailPage = lazy(() => import('./pages/FilmDetailPage'))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'))
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'))
const FeedPage = lazy(() => import('./pages/FeedPage'))
const ListsPage = lazy(() => import('./pages/ListsPage'))
const ListDetailPage = lazy(() => import('./pages/ListDetailPage'))
const VenuePage = lazy(() => import('./pages/VenuePage'))
const VenueDashboard = lazy(() => import('./pages/VenueDashboard'))
const CinemasPage = lazy(() => import('./pages/CinemasPage'))
const PersonPage = lazy(() => import('./pages/PersonPage'))
const DispatchPage = lazy(() => import('./pages/DispatchPage'))
const MembershipPage = lazy(() => import('./pages/MembershipPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const YearInCinemaPage = lazy(() => import('./pages/YearInCinemaPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const DebugPanel = lazy(() => import('./pages/DebugPanel'))
const StudioPage = lazy(() => import('./pages/StudioPage'))
const LogDetailPage = lazy(() => import('./pages/LogDetailPage'))

// Desktop and Mobile use simple, fast hardware-accelerated fades (The Seamless Splice)
// We remove clipPath to eliminate the "janky" aperture flash and make it feel like a cohesive SPA
const pageVariantsDesktop = {
  initial: { opacity: 0, filter: 'sepia(0.4) brightness(1.1)', scale: 0.98 },
  in: { opacity: 1, filter: 'sepia(0) brightness(1)', scale: 1 },
  out: { opacity: 0, filter: 'sepia(0.3)', scale: 1.02 },
}

const pageVariantsMobile = {
  initial: { opacity: 0 },
  in: { opacity: 1 },
  out: { opacity: 0 },
}

const pageTransitionDesktop = { type: 'tween', ease: 'easeInOut', duration: 0.2 }
const pageTransitionMobile = { type: 'tween', ease: 'easeOut', duration: 0.15 }

function PageFallback() {
  return <FilmStripLoader message="THREADING REEL…" />
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  const { isTouch: IS_TOUCH } = useViewport()
  // Respect prefers-reduced-motion: skip all page animations
  if (PREFERS_REDUCED_MOTION) {
    return <div style={{ position: 'relative', background: 'var(--ink)' }}>{children}</div>
  }

  if (IS_TOUCH) {
    return (
      <div
        className="page-fade-in"
        style={{ position: 'relative', background: 'var(--ink)' }}
      >
        {children}
      </div>
    )
  }

  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariantsDesktop}
      transition={pageTransitionDesktop as any}
      style={{ position: 'relative', background: 'var(--ink)' }}
    >
      {children}
    </motion.div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()

  // ── PKCE / OAuth Callback Interceptor ──
  // Email links from Resend/Supabase often land on the root URL instead of a callback route.
  // This hook intercepts tokens on the homepage and redirects them to the verification logic.
  useEffect(() => {
    if (
      location.pathname === '/' &&
      (location.search.includes('token_hash=') || 
       location.hash.includes('access_token=') || 
       location.hash.includes('error_description='))
    ) {
      navigate(`/auth/callback${location.search}${location.hash}`, { replace: true })
    }
  }, [location, navigate])

  // Granular selector — only re-renders App when logs.length changes, not on every store write
  const logCount = useFilmStore(state => state.logs.length)
  const logs = useFilmStore(state => state.logs)
  const { openLogModal, showPaywall, paywallFeature, closePaywall, openHandbook } = useUIStore()
  const { user } = useAuthStore()
  const [csvImportOpen, setCsvImportOpen] = useState(false)

  // ── Enhanced Keyboard Shortcuts (G+key navigation) ──
  const { showHelp, setShowHelp } = useKeyboardShortcuts()

  // ── Analytics — auto page views + manual tracking ──
  const { trackEvent } = useAnalytics()

  // ── Persistent Achievements — detect new badge unlocks ──
  const { newBadges, dismissNewBadge } = useAchievements(user?.id, logs)

  const degradationClass = useMemo(() => {
    if (logCount > 40) return 'level-obsessed'
    if (logCount > 15) return 'level-degrade'
    return ''
  }, [logCount])

  // Desktop and Mobile: show 3-count clapperboard preloader only once per session
  const [showPreloader, setShowPreloader] = useState(() => {
    if (typeof window === 'undefined') return false
    if (sessionStorage.getItem('reelhouse_init_loaded')) return false
    return true
  })

  // Persistent scroll position — save on leave, restore on return
  useEffect(() => {
    const savedPos = sessionStorage.getItem(`scroll:${location.pathname}`)
    const scrollY = savedPos ? (parseInt(savedPos, 10) || 0) : 0
    const id = requestAnimationFrame(() => window.scrollTo(0, scrollY))
    return () => {
      sessionStorage.setItem(`scroll:${location.pathname}`, String(window.scrollY))
      cancelAnimationFrame(id)
    }
  }, [location.pathname])

  // CRITICAL: Prefetch trending data IMMEDIATELY — it drives the hero LCP image
  // Top-rated and now-playing are below-fold, so they can wait for idle
  const queryClient = useQueryClient()
  useEffect(() => {
    // Trending: fire immediately — hero image depends on this
    queryClient.prefetchQuery({ queryKey: ['trending'], queryFn: () => tmdb.trending('week'), staleTime: 1000 * 60 * 10 })

    // Below-fold: prefetch during idle
    const prefetchRest = () => {
      queryClient.prefetchQuery({ queryKey: ['top-rated'], queryFn: () => tmdb.topRated() })
      queryClient.prefetchQuery({ queryKey: ['now-playing'], queryFn: () => tmdb.nowPlaying() })
    }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prefetchRest, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    } else {
      const id = setTimeout(prefetchRest, 2000)
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Elite Backend: Initialize Live global data stream + error logging
  useEffect(() => {
    initAuthSync()
    initRealtime()
    // Log unhandled errors to Supabase for production monitoring
    import('./errorLogger').then(m => m.initGlobalErrorLogging())
  }, [])

  // ── Custom event listeners for keyboard shortcuts ──
  useEffect(() => {
    const handleOpenLog = () => openLogModal()
    window.addEventListener('reelhouse:openLogModal', handleOpenLog)
    return () => window.removeEventListener('reelhouse:openLogModal', handleOpenLog)
  }, [openLogModal])

  return (
    <div className={degradationClass}>
      {/* Skip-to-content link — visible only on keyboard focus */}
      <a
        href="#main-content"
        style={{
          position: 'fixed', top: '-100%', left: '1rem', zIndex: 100000,
          background: 'var(--ink)', color: 'var(--flicker)', padding: '0.75rem 1.5rem',
          fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.15em',
          border: '2px solid var(--sepia)', borderRadius: '2px', textDecoration: 'none',
          transition: 'top 0.15s',
        }}
        onFocus={e => { e.currentTarget.style.top = '1rem' }}
        onBlur={e => { e.currentTarget.style.top = '-100%' }}
      >
        SKIP TO CONTENT
      </a>

      {/* Screen-reader-only live region for toast announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only"
        style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      />
      {/* Preloader: desktop only, skipped on mobile, fires once per session */}
      {showPreloader && <Preloader onComplete={() => {
        setShowPreloader(false)
        sessionStorage.setItem('reelhouse_init_loaded', 'true')
      }} />}

      <CustomCursor />

      {/* Bottom Tab Navigation — mobile only */}
      <BottomNav />

      {/* Suspense wrapper handles BOTH global modals AND route-level pages */}
      <Suspense fallback={<PageFallback />}>
        <ErrorBoundary>
          {/* Mount Modals inside Suspense so they lazy-load when their internal state flips to open */}
          <Navbar />
          <OfflineBanner />
      <InstallPrompt />
          <QualityOfLife />


          {showPaywall && <PaywallModal featureName={paywallFeature} onClose={closePaywall} />}
          <CommandPalette />
          <LogModal />
          <SignupModal />
          <HandbookModal />
          <OnboardingModal />
          {csvImportOpen && <CSVImport onClose={() => setCsvImportOpen(false)} />}
          {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
          {newBadges.length > 0 && <AchievementToast badge={newBadges[0]} onDismiss={() => dismissNewBadge(newBadges[0].key)} />}

          <main id="main-content" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<ErrorBoundary key="home"><PageWrapper><HomePage /></PageWrapper></ErrorBoundary>} />
              <Route path="/film/:id" element={<ErrorBoundary key="film"><PageWrapper><FilmDetailPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/log/:logId" element={<ErrorBoundary key="log"><PageWrapper><LogDetailPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/user/:username/:tab?" element={<ErrorBoundary key="profile"><PageWrapper><UserProfilePage /></PageWrapper></ErrorBoundary>} />
              <Route path="/discover" element={<ErrorBoundary key="discover"><PageWrapper><DiscoverPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/feed" element={<ErrorBoundary key="feed"><PageWrapper><FeedPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/lists" element={<ErrorBoundary key="lists"><PageWrapper><ListsPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/stacks" element={<ErrorBoundary key="stacks"><PageWrapper><ListsPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/lists/:id" element={<ErrorBoundary key="list-detail"><PageWrapper><ListDetailPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/stacks/:id" element={<ErrorBoundary key="stack-detail"><PageWrapper><ListDetailPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/venue/:venueId" element={<ErrorBoundary key="venue"><PageWrapper><VenuePage /></PageWrapper></ErrorBoundary>} />
              <Route path="/venue-dashboard" element={<ErrorBoundary key="venue-dash"><PageWrapper><VenueDashboard /></PageWrapper></ErrorBoundary>} />
              <Route path="/cinemas" element={<ErrorBoundary key="cinemas"><PageWrapper><CinemasPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/person/:id" element={<ErrorBoundary key="person"><PageWrapper><PersonPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/dispatch" element={<ErrorBoundary key="dispatch"><PageWrapper><DispatchPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/patronage" element={<ErrorBoundary key="patronage"><PageWrapper><MembershipPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/society" element={<ErrorBoundary key="society"><PageWrapper><MembershipPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/auth/callback" element={<ErrorBoundary key="auth"><AuthCallbackPage /></ErrorBoundary>} />
              <Route path="/auth/reset-password" element={<ErrorBoundary key="reset-pw"><PageWrapper><ResetPasswordPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/darkroom" element={<Navigate to="/discover" replace />} />
              <Route path="/membership" element={<Navigate to="/patronage" replace />} />
              <Route path="/year-in-cinema" element={<ErrorBoundary key="yic"><PageWrapper><YearInCinemaPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary key="settings"><PageWrapper><SettingsPage /></PageWrapper></ErrorBoundary>} />
              <Route path="/admin" element={<ErrorBoundary key="admin"><PageWrapper><DebugPanel /></PageWrapper></ErrorBoundary>} />
              <Route path="/studio" element={<ErrorBoundary key="studio"><PageWrapper><StudioPage /></PageWrapper></ErrorBoundary>} />
              <Route path="*" element={<ErrorBoundary key="404"><PageWrapper><NotFoundPage /></PageWrapper></ErrorBoundary>} />

            </Routes>
          </AnimatePresence>
          </main>
        </ErrorBoundary>
      </Suspense>

      <Footer />

    </div>
  )
}
