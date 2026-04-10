import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster, toast } from 'react-hot-toast'
import * as Sentry from '@sentry/react'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import App from './App.jsx'
import { queryClient } from './queryClient'
import './index.css'
import './styles/reel.css'

// ── Sentry Error Monitoring (production only, zero dev overhead) ──
// DSN is intentionally public — it's a client-side key by Sentry's design
if (import.meta.env.PROD) {
  Sentry.init({
    dsn: 'https://1a619872bca621c5bd5d9b7f45edecf5@o4511019614208000.ingest.us.sentry.io/4511019626463232',
    environment: 'production',
    tracesSampleRate: 0.1, // 10% of sessions — enough signal, minimal overhead
    replaysOnErrorSampleRate: 0,
    integrations: [],
  })
}

// ── PostHog Telemetry (Analytics, Session Replays, Funnels) ──
// Auto-captures everything for CTO-level business metric visibility.
if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false, // React Router dictates dynamic captures inside the app
  })
}


// ── Core Web Vitals — zero dependency, native PerformanceObserver ──
// Lazy-loaded to avoid blocking initial render
setTimeout(() => {
  import('./utils/webVitals').then(({ reportWebVitals }) => {
    reportWebVitals((metric) => {
      // In production: add as Sentry breadcrumb for correlation with errors
      if (import.meta.env.PROD) {
        Sentry.addBreadcrumb({
          category: 'web-vital',
          message: `${metric.name}: ${Math.round(metric.value)}ms [${metric.rating}]`,
          level: metric.rating === 'poor' ? 'warning' : 'info',
        })
      } else {
        // In dev: log to console with color coding
        const colors = { good: '#22c55e', 'needs-improvement': '#f59e0b', poor: '#ef4444' }
        console.log(
          `%c[WebVital] ${metric.name}: ${Math.round(metric.value)}${metric.name === 'CLS' ? '' : 'ms'} (${metric.rating})`,
          `color: ${colors[metric.rating]}; font-weight: bold;`
        )
      }
    })
  })
}, 3000) // Wait 3s after page load to start measuring

// ── Global Broken Image Fallback Interceptor ──
// Prevents the UI from shattering when TMDB lacks a poster or the connection drops.
window.addEventListener('error', (e: any) => {
  if (e.target && e.target.tagName === 'IMG') {
    if (!e.target.dataset.fallbackApplied) {
      e.target.dataset.fallbackApplied = 'true'
      e.target.src = '/reelhouse-logo.svg' // The ReelHouse master geometric mark
      e.target.style.filter = 'grayscale(100%) opacity(0.2)'
      e.target.style.objectFit = 'contain'
      e.target.style.padding = '2rem'
      e.target.style.backgroundColor = '#0A0703'
      e.target.style.border = '1px solid #1C1710'
    }
  }
}, true) // Capture phase is required because 'error' events do not bubble



// ── Custom Nitrate Noir Toast Renderer ──
function NoirToast({ t, message, icon }: any) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        background: 'linear-gradient(135deg, #1C1710 0%, #0A0703 100%)',
        border: '1px solid #3A3228',
        borderLeft: '3px solid #8B6914',
        borderRadius: '2px 6px 3px 5px / 3px 4px 5px 3px',
        padding: '0.6rem 1rem',
        fontFamily: "'Bungee', sans-serif",
        fontSize: '0.62rem',
        letterSpacing: '0.12em',
        color: '#E8DFC8',
        boxShadow: '0 4px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,105,20,0.1)',
        maxWidth: '320px',
        opacity: t.visible ? 1 : 0,
        transform: t.visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        willChange: 'opacity, transform',
      }}
    >
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
      <span style={{ lineHeight: 1.4 }}>{message}</span>
    </div>
  )
}

// Expose custom toast helpers globally (dev only — tree-shaken in production)
if (!import.meta.env.PROD) {
  (window as any).__rh_toast = {
    log: (msg: string) => toast.custom((t) => <NoirToast t={t} message={msg} icon="✦" />),
    err: (msg: string) => toast.custom((t) => <NoirToast t={t} message={msg} icon="†" />),
    info: (msg: string) => toast.custom((t) => <NoirToast t={t} message={msg} icon="◈" />),
  }
}

let root = (window as any)._reactRoot
const rootElement = document.getElementById('root')

if (rootElement) {
  if (!root) {
    root = ReactDOM.createRoot(rootElement)
    ;(window as any)._reactRoot = root
  }

  root.render(
    <React.StrictMode>
      <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary>
            <PostHogProvider client={posthog}>
              <App />
            </PostHogProvider>
          </ErrorBoundary>
          <Toaster
            position="bottom-center"
            gutter={8}
            containerClassName="reel-toast-container"
            containerStyle={{ zIndex: 99999, bottom: 20 }}
            toastOptions={{
              duration: 3000,
              style: {
                background: 'transparent',
                boxShadow: 'none',
                padding: 0,
                margin: 0,
              },
              success: {
                duration: 2500,
                icon: null,
                style: {
                  background: 'linear-gradient(135deg, #1C1710 0%, #0A0703 100%)',
                  border: '1px solid #3A3228',
                  borderLeft: '3px solid #F2E8A0',
                  borderRadius: '2px 6px 3px 5px / 3px 4px 5px 3px',
                  padding: '0.75rem 1.25rem',
                  fontFamily: "'Bungee', sans-serif",
                  fontSize: '0.65rem',
                  letterSpacing: '0.12em',
                  color: '#E8DFC8',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(242,232,160,0.15)',
                  maxWidth: '360px',
                },
              },
              error: {
                duration: 3500,
                icon: null,
                style: {
                  background: 'linear-gradient(135deg, #1C1710 0%, #0A0703 100%)',
                  border: '1px solid #5C1A0B',
                  borderLeft: '3px solid #a82424',
                  borderRadius: '2px 6px 3px 5px / 3px 4px 5px 3px',
                  padding: '0.75rem 1.25rem',
                  fontFamily: "'Bungee', sans-serif",
                  fontSize: '0.65rem',
                  letterSpacing: '0.12em',
                  color: '#E8DFC8',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.8), 0 0 0 1px rgba(162,36,36,0.2)',
                  maxWidth: '360px',
                },
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
      </HelmetProvider>
    </React.StrictMode>,
  )
}
