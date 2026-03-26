import React from 'react'
import Buster from './Buster'

/**
 * SectionErrorBoundary — lightweight boundary for individual page sections.
 * If a section crashes, only that section shows a compact retry panel.
 * The rest of the page stays fully functional.
 */
class SectionErrorBoundary extends React.Component<any, any> {
    constructor(props: any) {
        super(props)
        this.state = { hasError: false, retryCount: 0 }
    }

    static getDerivedStateFromError() {
        return { hasError: true }
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error('Section Error:', error)
        this.setState((prev: any) => ({ retryCount: prev.retryCount + 1 }))
        import('../errorLogger').then(m => m.logError({
            type: 'section_boundary',
            message: error?.message,
            stack: error?.stack?.slice(0, 1000),
            component: errorInfo?.componentStack?.slice(0, 500),
        })).catch(() => {})
    }

    handleRetry = () => {
        if (this.state.retryCount >= 2) {
            // Hard panic: unrecoverable render loop detected, flush app memory
            window.location.reload()
        } else {
            // Soft try
            this.setState({ hasError: false })
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="section-error">
                    <Buster size={48} mood="worried" />
                    <div className="ui-callout" style={{ color: 'var(--sepia)', marginTop: '1rem' }}>
                        {this.props.label || 'SECTION UNAVAILABLE'}
                    </div>
                    <div className="ui-label" style={{ color: 'var(--fog)', marginTop: '0.5rem', marginBottom: '1rem' }}>
                        A frame has slipped — this section couldn't render.
                    </div>
                    <button
                        className={this.state.retryCount >= 2 ? "btn btn-primary" : "btn btn-ghost"}
                        style={{ fontSize: '0.6rem', marginTop: '0.5rem' }}
                        onClick={this.handleRetry}
                    >
                        {this.state.retryCount >= 2 ? 'HARD RESET' : 'TRY AGAIN'}
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

export default SectionErrorBoundary
