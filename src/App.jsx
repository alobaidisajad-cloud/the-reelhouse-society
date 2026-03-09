import { Suspense, lazy, useEffect, useState, useMemo } from 'react'
import { Routes, Route, useLocation, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { tmdb } from './tmdb'
import Navbar from './components/Navbar'
import Preloader from './components/Preloader'
import CustomCursor from './components/CustomCursor'
import { useFilmStore, useUIStore, initRealtime, initAuthSync } from './store'
import Soundscape from './components/Soundscape'
import InstallPrompt from './components/InstallPrompt'
import QualityOfLife from './components/QualityOfLife'

// ── Heavy Global Modals (Lazy Loaded) ──
// BootcampModal retired — onboarding content lives in the Handbook now
const PaywallModal = lazy(() => import('./components/PaywallModal'))
const LogModal = lazy(() => import('./components/LogModal'))
const SignupModal = lazy(() => import('./components/SignupModal'))
const HandbookModal = lazy(() => import('./components/HandbookModal'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))

// Detect touch once — controls which desktop-only effects to mount
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches

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

// Desktop: full iris transition. Mobile: simple fade (no clip-path GPU thrash)
const pageVariantsDesktop = {
  initial: { opacity: 1, clipPath: 'circle(150% at 50% 50%)' },
  in: { opacity: 1, clipPath: 'circle(150% at 50% 50%)' },
  out: { opacity: 1, clipPath: 'circle(0% at 50% 50%)' },
}

const pageVariantsMobile = {
  initial: { opacity: 0 },
  in: { opacity: 1 },
  out: { opacity: 0 },
}

const pageTransitionDesktop = { type: 'tween', ease: 'easeInOut', duration: 0.45 }
const pageTransitionMobile = { type: 'tween', ease: 'easeOut', duration: 0.2 }

// Static — defined once, never re-created on each render
const FOOTER_FILMSTRIP = Array.from({ length: 20 })

function PageFallback() {
  return <div style={{ minHeight: '100vh', background: 'var(--ink)' }} />
}

function PageWrapper({ children }) {
  if (IS_TOUCH) {
    // Mobile: no clip-path, no aperture flash — just cheap opacity fade
    return (
      <motion.div
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariantsMobile}
        transition={pageTransitionMobile}
        style={{ position: 'relative', background: 'var(--ink)' }}
      >
        {children}
      </motion.div>
    )
  }

  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariantsDesktop}
      transition={pageTransitionDesktop}
      style={{ position: 'relative', background: 'var(--ink)' }}
    >
      {children}
    </motion.div>
  )
}

export default function App() {
  const location = useLocation()
  // Granular selector — only re-renders App when logs.length changes, not on every store write
  const logCount = useFilmStore(state => state.logs.length)
  const { openLogModal, showPaywall, paywallFeature, closePaywall, openHandbook } = useUIStore()

  const degradationClass = useMemo(() => {
    if (logCount > 40) return 'level-obsessed'
    if (logCount > 15) return 'level-degrade'
    return ''
  }, [logCount])

  // Mobile: skip preloader entirely — show content instantly
  // Desktop: show 3-count clapperboard preloader only once per session
  const [showPreloader, setShowPreloader] = useState(() => {
    if (typeof window === 'undefined') return false
    if (IS_TOUCH) return false
    if (sessionStorage.getItem('reelhouse_init_loaded')) return false
    return true
  })

  // Persistent scroll position — save on leave, restore on return
  useEffect(() => {
    const savedPos = sessionStorage.getItem(`scroll:${location.pathname}`)
    const scrollY = savedPos ? parseInt(savedPos, 10) : 0
    const id = requestAnimationFrame(() => window.scrollTo(0, scrollY))
    return () => {
      sessionStorage.setItem(`scroll:${location.pathname}`, String(window.scrollY))
      cancelAnimationFrame(id)
    }
  }, [location.pathname])

  // Idle prefetch — load key data while browser is idle
  const queryClient = useQueryClient()
  useEffect(() => {
    const prefetch = () => {
      queryClient.prefetchQuery({ queryKey: ['trending'], queryFn: () => tmdb.trending('week') })
      queryClient.prefetchQuery({ queryKey: ['top-rated'], queryFn: () => tmdb.topRated() })
      queryClient.prefetchQuery({ queryKey: ['now-playing'], queryFn: () => tmdb.nowPlaying() })
    }
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prefetch, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    } else {
      const id = setTimeout(prefetch, 2000)
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Elite Backend: Initialize Live global data stream
  useEffect(() => {
    initAuthSync()
    initRealtime()
  }, [])

  return (
    <div className={degradationClass}>
      {/* Preloader: desktop only, skipped on mobile, fires once per session */}
      {showPreloader && <Preloader onComplete={() => {
        setShowPreloader(false)
        sessionStorage.setItem('reelhouse_init_loaded', 'true')
      }} />}

      <CustomCursor />

      {/* Floating Action Button — mobile only */}
      <button
        className="mobile-fab"
        onClick={() => openLogModal()}
        aria-label="Log a Film"
      >
        +
      </button>

      {/* Suspense wrapper handles BOTH global modals AND route-level pages */}
      <Suspense fallback={<PageFallback />}>
        {/* Mount Modals inside Suspense so they lazy-load when their internal state flips to open */}
        <Navbar />
        {!IS_TOUCH && <Soundscape />}
        <InstallPrompt />
        <QualityOfLife />


        {showPaywall && <PaywallModal featureName={paywallFeature} onClose={closePaywall} />}
        <CommandPalette />
        <LogModal />
        <SignupModal />
        <HandbookModal />

        <AnimatePresence mode="wait" initial={false}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<PageWrapper><HomePage /></PageWrapper>} />
            <Route path="/film/:id" element={<PageWrapper><FilmDetailPage /></PageWrapper>} />
            <Route path="/user/:username" element={<PageWrapper><UserProfilePage /></PageWrapper>} />
            <Route path="/discover" element={<PageWrapper><DiscoverPage /></PageWrapper>} />
            <Route path="/feed" element={<PageWrapper><FeedPage /></PageWrapper>} />
            <Route path="/lists" element={<PageWrapper><ListsPage /></PageWrapper>} />
            <Route path="/lists/:id" element={<PageWrapper><ListDetailPage /></PageWrapper>} />
            <Route path="/venue/:venueId" element={<PageWrapper><VenuePage /></PageWrapper>} />
            <Route path="/venue-dashboard" element={<PageWrapper><VenueDashboard /></PageWrapper>} />
            <Route path="/cinemas" element={<PageWrapper><CinemasPage /></PageWrapper>} />
            <Route path="/person/:id" element={<PageWrapper><PersonPage /></PageWrapper>} />
            <Route path="/dispatch" element={<PageWrapper><DispatchPage /></PageWrapper>} />
            <Route path="/patronage" element={<PageWrapper><MembershipPage /></PageWrapper>} />
            <Route path="*" element={<PageWrapper><NotFoundPage /></PageWrapper>} />
          </Routes>
        </AnimatePresence>
      </Suspense>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--ash)', background: 'var(--soot)', padding: '2rem 0' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: '1rem', opacity: 0.15 }}>
            {FOOTER_FILMSTRIP.map((_, i) => (
              <div key={i} style={{ width: 20, height: 14, border: '1px solid var(--sepia)', borderRadius: 1 }} />
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--sepia)', marginBottom: '0.4rem', animation: 'flicker-text 8s ease-in-out infinite' }}>
            The ReelHouse Society
          </div>
          <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--fog)', marginBottom: '0.75rem' }}>
            Where Cinema Lives Between Life and Death
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {[
              { to: '/', label: 'The Lobby' },
              { to: '/discover', label: 'Dark Room' },
              { to: '/feed', label: 'The Reel' },
              { to: '/dispatch', label: 'The Dispatch' },
              { to: '/lists', label: 'The Stacks' },
              { to: '/cinemas', label: 'Cinemas' },
              { to: '/patronage', label: 'The Society' },
            ].map(({ to, label }) => (
              <Link key={to} to={to} style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--fog)', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseOver={(e) => e.target.style.color = 'var(--flicker)'}
                onMouseOut={(e) => e.target.style.color = 'var(--fog)'}
              >
                {label}
              </Link>
            ))}
            <button
              onClick={openHandbook}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--sepia)', textDecoration: 'none', transition: 'filter 0.2s', fontWeight: 'bold' }}
              onMouseOver={(e) => e.target.style.filter = 'brightness(1.5)'}
              onMouseOut={(e) => e.target.style.filter = 'brightness(1)'}
            >
              Society Handbook
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.12em', color: 'var(--ash)' }}>
            Film data provided by TMDB · Built with nitrate &amp; obsession
          </div>
        </div>
      </footer>
    </div>
  )
}
