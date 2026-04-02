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
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', background: 'var(--danger)', color: 'white', borderColor: 'var(--danger)' }} onClick={() => {
                        if (logModalEditLogId) {
                            removeLog(logModalEditLogId)
                            reelToast.success('Log deleted.')
                            closeLogModal()
                        }
                    }}>CONFIRM DELETE</button>
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowDeleteConfirm(false)}>CANCEL</button>
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
            {logModalEditLogId && (
                <button 
                    className="btn btn-ghost" 
                    aria-label="Delete log"
                    title="Delete Log" 
                    style={{ color: 'var(--danger)', padding: '0 0.75rem', borderColor: 'var(--ash)' }} 
                    onClick={() => setShowDeleteConfirm(true)}
                >
                    <Trash2 size={16} />
                </button>
            )}
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleLog} disabled={submitting}>
                {submitting ? 'SAVING...' : (logModalEditLogId ? 'Save Changes' : 'Log This Film')}
            </button>
            <button className="btn btn-ghost" onClick={closeLogModal}>
                Cancel
            </button>
        </div>
    )
}
