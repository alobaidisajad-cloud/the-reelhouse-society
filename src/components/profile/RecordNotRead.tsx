/**
 * RecordNotRead — what a room drawn from a member's record says while it has
 * no record to draw: still being read, refused to this viewer (the server
 * keeps a private member's record, and every record from a signed-out
 * visitor), or not reachable. Never an empty case that reads as "nothing earned".
 */
import type { ProfileAnalytics } from '../../constants/honours'

export function RecordNotRead({ analytics, failed }: { analytics?: ProfileAnalytics | null; failed?: boolean }) {
    const words = analytics?.error
        ? 'THIS RECORD IS NOT OPEN TO YOU'
        : failed || analytics
            ? 'THE RECORD COULD NOT BE READ'
            : 'READING THE RECORD…'
    return (
        <div className="card" role="status" style={{ padding: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
            {words}
        </div>
    )
}
