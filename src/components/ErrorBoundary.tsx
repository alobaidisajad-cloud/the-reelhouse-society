import React from 'react'
import Buster from './Buster'

interface ErrorBoundaryProps {
    children: React.ReactNode
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Film Breakage Detected:", error, errorInfo)
        // Log to Supabase error_logs for production monitoring
        import('../errorLogger').then(m => m.logError({
            type: 'react_boundary',
            message: error?.message,
            stack: error?.stack,
            component: errorInfo?.componentStack?.slice(0, 2000),
        })).catch(() => { })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--ink)',
                    color: 'var(--parchment)',
                    padding: '2rem',
                    textAlign: 'center',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    <style>{`* { cursor: auto !important; }`}</style>
                    {/* Static noise overlay */}
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        opacity: 0.1,
                        backgroundImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")',
                        pointerEvents: 'none'
                    }} />

                    <Buster size={120} mood="crying" />

                    <h1 style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '2.5rem',
                        margin: '1.5rem 0 0.5rem',
                        color: 'var(--blood-reel)',
                        textShadow: '0 0 20px rgba(92, 26, 11, 0.4)'
                    }}>
                        FILM BREAKAGE
                    </h1>

                    <div style={{
                        background: 'var(--soot)',
                        border: '1px solid var(--sepia)',
                        padding: '1.5rem',
                        borderRadius: '2px',
                        maxWidth: '500px',
                        position: 'relative',
                        marginTop: '1rem'
                    }}>
                        <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.1em', color: 'var(--fog)', marginBottom: '1rem' }}>
                            REEL NO. {Math.floor(Math.random() * 9000) + 1000} — SYSTEM FAILURE
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--bone)', marginBottom: '1.5rem' }}>
                            The projector has jammed. A frame has melted. The sequence is lost to the shadows.
                        </p>

                        <button
                            className="btn btn-primary"
                            onClick={() => window.location.href = '/'}
                            style={{ fontSize: '0.8rem' }}
                        >
                            Return to Lobby
                        </button>
                    </div>

                    <p style={{
                        marginTop: '1rem',
                        fontFamily: 'var(--font-ui)',
                        fontSize: '0.6rem',
                        color: 'var(--ash)',
                        fontStyle: 'italic',
                        letterSpacing: '0.05em',
                    }}>
                        — INCIDENT LOGGED TO THE ARCHIVE —
                    </p>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
