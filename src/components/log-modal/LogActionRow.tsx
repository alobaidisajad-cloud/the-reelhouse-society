import { Trash2 } from 'lucide-react'
import reelToast from '../../utils/reelToast'

interface LogActionRowProps {
    showDeleteConfirm: boolean
    setShowDeleteConfirm: (show: boolean) => void
    logModalEditLogId: string | null
    removeLog: (id: string) => void
    closeLogModal: () => void
    handleLog: () => void
    submitting: boolean
}

export default function LogActionRow({ 
    showDeleteConfirm, 
    setShowDeleteConfirm, 
    logModalEditLogId, 
    removeLog, 
    closeLogModal, 
    handleLog, 
    submitting 
}: LogActionRowProps) {
    if (showDeleteConfirm) {
        return (
            <div style={{ background: 'rgba(255,50,50,0.1)', border: '1px solid var(--danger)', borderRadius: '4px', padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', color: 'var(--danger)', letterSpacing: '0.1em', marginBottom: '1rem' }}>DELETE THIS LOG? THIS CANNOT BE UNDONE.</div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" style={{ flex: '1 1 auto', justifyContent: 'center', background: 'var(--danger)', color: 'white', borderColor: 'var(--danger)' }} onClick={() => {
                        if (logModalEditLogId) {
                            removeLog(logModalEditLogId)
                            reelToast.success('Log deleted.')
                            closeLogModal()
                        }
                    }}>CONFIRM DELETE</button>
                    <button className="btn btn-ghost" style={{ flex: '1 1 auto', justifyContent: 'center' }} onClick={() => setShowDeleteConfirm(false)}>CANCEL</button>
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Primary actions row */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ flex: '1 1 auto', justifyContent: 'center' }} onClick={handleLog} disabled={submitting}>
                    {submitting ? 'SAVING...' : (logModalEditLogId ? 'Save Changes' : 'Log This Film')}
                </button>
                <button className="btn btn-ghost" style={{ flex: '0 1 auto' }} onClick={closeLogModal}>
                    Cancel
                </button>
            </div>
            {/* Delete button — full width, clearly visible on all devices */}
            {logModalEditLogId && (
                <button 
                    className="btn btn-ghost" 
                    aria-label="Delete log"
                    style={{
                        width: '100%',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        color: 'var(--fog)',
                        borderColor: 'rgba(255,255,255,0.06)',
                        fontSize: '0.55rem',
                        letterSpacing: '0.12em',
                        padding: '0.6rem',
                    }}
                    onClick={() => setShowDeleteConfirm(true)}
                >
                    <Trash2 size={12} />
                    DELETE THIS LOG
                </button>
            )}
        </div>
    )
}
