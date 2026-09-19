/**
 * LegalBack — the way back from the Terms and the Privacy Policy, when there is one.
 *
 * Both pages used to say "BACK TO SETTINGS" and link there. The app opens them
 * in its own in-app browser, straight to the page — so a member reading the
 * Terms from the Society page was offered a link into the website's Settings,
 * behind a sign-in, from inside the app. The in-app browser has its own close
 * button; what the page owes is not a wrong door.
 *
 * So the link appears only when this visit has a page to go back to, and it
 * goes back to THAT page, wherever it was. React Router gives the first page of
 * a visit the key 'default'; any page reached by navigating inside the site has
 * a key of its own.
 */
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function LegalBack() {
    const navigate = useNavigate()
    const { key } = useLocation()
    if (key === 'default') return null
    return (
        <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: '2rem', transition: 'color 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--sepia)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--fog)' }}
        >
            <ArrowLeft size={14} /> BACK
        </button>
    )
}
