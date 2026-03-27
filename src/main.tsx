import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster, toast } from 'react-hot-toast'
import * as Sentry from '@sentry/react'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import App from './App.jsx'
import './index.css'

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



export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60 * 1000, // 30 min — film data doesn't change frequently
      gcTime: 60 * 60 * 1000,    // 1 hour cache lifetime
      retry: 2,                   // retry failed requests twice before showing error
      refetchOnWindowFocus: false, // 🛡️ Protect explicit quotas from tab cycling
    },
    mutations: {
      onError: () => {
        toast.error('Something went wrong — please try again.')
      },
    },
  },
})

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

// Expose custom toast helpers globally
(window as any).__rh_toast = {
  log: (msg: string) => toast.custom((t) => <NoirToast t={t} message={msg} icon="✦" />),
  err: (msg: string) => toast.custom((t) => <NoirToast t={t} message={msg} icon="†" />),
  info: (msg: string) => toast.custom((t) => <NoirToast t={t} message={msg} icon="◈" />),
}

let root = (window as any)._reactRoot
if (!root) {
  root = ReactDOM.createRoot(document.getElementById('root')!)
  ;(window as any)._reactRoot = root
}

root.render(
  <React.StrictMode>
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster
          position="top-center"
          gutter={8}
          containerStyle={{ zIndex: 99999, top: 80 }}
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
