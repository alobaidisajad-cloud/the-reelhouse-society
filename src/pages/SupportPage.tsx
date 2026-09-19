/**
 * SupportPage — The Front Desk.
 *
 * The page the App Store and Google Play list as the Society's Support URL, and
 * the one the app opens from Settings → The Front Desk → Help & answers. So it
 * is read mostly on a phone, often inside the app's own browser, by someone
 * with a problem: the address comes first, and every answer names the exact
 * buttons the app draws, in the order you press them.
 *
 * Those button names are not typed into the answers. They live in APP_LABELS,
 * and a test reads the app's source to prove every one of them is still a real
 * label there — rename a button in the app and this page goes red until it
 * says the new name.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Copy, Check } from 'lucide-react'
import LegalBack from '../components/LegalBack'
import PageSEO from '../components/PageSEO'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../constants/support'
import '../styles/support.css'

/** The app's own words for the controls these answers send a member to. */
export const APP_LABELS = {
    settings: 'Settings',
    membership: 'Membership & billing',
    chooseRank: 'Choose your rank',
    restore: 'Restore purchases',
    manage: 'Manage subscription',
    accountActions: 'Account actions',
    deleteAccount: 'Delete account',
    importExport: 'Import & export',
    forgot: 'Forgot your credentials?',
} as const

/** Settings › Membership & billing › Choose your rank — a route through the app. */
function Path({ steps }: { steps: string[] }) {
    return (
        <span className="fd-path">
            {steps.map((s, i) => (
                <span key={s} className="fd-path-step">
                    {i > 0 && <span className="fd-path-sep" aria-hidden="true">›</span>}
                    {i > 0 && <span className="fd-sr"> then </span>}
                    <span className="fd-path-name">{s}</span>
                </span>
            ))}
        </span>
    )
}

function Question({ id, q, children }: { id: string; q: string; children: ReactNode }) {
    return (
        <details className="fd-q" id={id}>
            <summary>
                <span className="fd-q-text">{q}</span>
                <span className="fd-q-mark" aria-hidden="true" />
            </summary>
            <div className="fd-a">{children}</div>
        </details>
    )
}

const L = APP_LABELS

export default function SupportPage() {
    const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

    // A link straight to one answer (…/support#refund) opens that answer.
    useEffect(() => {
        const id = window.location.hash.slice(1)
        if (!id) return
        const el = document.getElementById(id)
        if (el instanceof HTMLDetailsElement) {
            el.open = true
            el.scrollIntoView({ block: 'start' })
        }
    }, [])

    const copy = async () => {
        try {
            if (!navigator.clipboard) throw new Error('no clipboard')
            await navigator.clipboard.writeText(SUPPORT_EMAIL)
            setCopied('copied')
        } catch {
            setCopied('failed')
        }
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied('idle'), 2400)
    }

    return (
        <div className="front-desk">
            <PageSEO
                title="The Front Desk"
                description="Write to The ReelHouse Society, or find the answer to a question about your rank, your subscription, your account or your data."
                path="/support"
            />

            <LegalBack />

            <header className="fd-head">
                <p className="fd-kicker">The ReelHouse Society</p>
                <h1 className="fd-title">The Front Desk</h1>
                <div className="fd-rule" aria-hidden="true"><span /><i /><span /></div>
                <p className="fd-dek">
                    A charge you don’t recognise, a rank that hasn’t arrived, something that isn’t working —
                    write to us. A person reads every letter and answers it.
                </p>
            </header>

            <section className="fd-card" aria-labelledby="fd-card-label">
                <p className="fd-card-label" id="fd-card-label">Write to</p>
                <p className="fd-address">
                    <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
                </p>
                <div className="fd-actions">
                    <a className="fd-btn fd-btn--primary" href={SUPPORT_MAILTO}>
                        <Mail size={15} aria-hidden="true" /> Write a letter
                    </a>
                    <button type="button" className="fd-btn" onClick={copy}>
                        {copied === 'copied'
                            ? <><Check size={15} aria-hidden="true" /> Copied</>
                            : <><Copy size={15} aria-hidden="true" /> Copy address</>}
                    </button>
                </div>
                <p className="fd-status" role="status" aria-live="polite">
                    {copied === 'copied' && 'The address is on your clipboard.'}
                    {copied === 'failed' && 'Your browser would not copy it — select the address above instead.'}
                </p>
                <p className="fd-card-note">
                    Write from any address. If it isn’t the one you signed up with, tell us your handle so we can find your account.
                </p>
            </section>

            <section className="fd-answers" aria-labelledby="fd-answers-title">
                <h2 className="fd-h2" id="fd-answers-title">Before you write</h2>

                <Question id="restore" q="I paid, but my rank hasn’t arrived">
                    <ol>
                        <li>Open the app, signed in to the account you bought the rank for.</li>
                        <li>Go to <Path steps={[L.settings, L.membership, L.chooseRank]} />.</li>
                        <li>At the foot of the Society page, tap <Path steps={[L.restore]} />.</li>
                    </ol>
                    <p>
                        Restoring looks for purchases on the Apple ID or Google account the phone is signed in to,
                        so use the one you paid with. If your rank still doesn’t appear, write to us — we will put it right.
                    </p>
                </Question>

                <Question id="cancel" q="How do I cancel?">
                    <p>
                        In the app, open the Society page (<Path steps={[L.settings, L.membership, L.chooseRank]} />)
                        and tap <Path steps={[L.manage]} />. It opens your store’s own subscription page.
                    </p>
                    <p>Or go to the store directly:</p>
                    <ul>
                        <li><strong>iPhone</strong> — <Path steps={['Settings', 'your name', 'Subscriptions']} /></li>
                        <li><strong>Android</strong> — <Path steps={['Google Play', 'your profile picture', 'Payments & subscriptions', 'Subscriptions']} /></li>
                    </ul>
                    <p>
                        Cancelling stops the next renewal. Your rank stays until the end of the period you have
                        already paid for. A founding seat is one payment and never renews, so there is nothing to cancel.
                    </p>
                </Question>

                <Question id="refund" q="Can I get a refund?">
                    <p>
                        Memberships are bought through the App Store or Google Play, so Apple and Google hold the
                        payment and decide refunds under their own rules. We can’t refund a store purchase ourselves.
                    </p>
                    <ul>
                        <li><strong>App Store</strong> — <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer">reportaproblem.apple.com</a></li>
                        <li><strong>Google Play</strong> — <a href="https://support.google.com/googleplay/answer/2479637" target="_blank" rel="noopener noreferrer">Google Play refund help</a></li>
                    </ul>
                    <p>If something went wrong on our side, write to us as well.</p>
                </Question>

                <Question id="delete" q="How do I delete my account?">
                    <p>
                        In the app, go to <Path steps={[L.settings, L.accountActions, L.deleteAccount]} />.
                        It erases your account, your diary, your lists and your notes, and it cannot be undone.
                    </p>
                    <p className="fd-warn">
                        Deleting your account does not cancel a subscription. Cancel it in the store first
                        (see <a href="#cancel" onClick={() => { const c = document.getElementById('cancel'); if (c instanceof HTMLDetailsElement) c.open = true }}>How do I cancel?</a>),
                        or the store will keep charging you.
                    </p>
                    <p>On the website, write to us from the email address on your account and we will delete it for you.</p>
                </Question>

                <Question id="data" q="How do I take my data with me?">
                    <p>
                        Go to <Path steps={[L.settings, L.importExport]} />. The app exports your diary as a
                        spreadsheet (CSV) or as your full archive (JSON); the website exports the CSV.
                    </p>
                    <p>The same place brings an archive in from another film diary.</p>
                </Question>

                <Question id="sign-in" q="I can’t sign in">
                    <p>
                        On the sign-in screen, tap <Path steps={[L.forgot]} /> and we will email you a link to set a
                        new password. If it doesn’t arrive, look in your spam folder, then write to us from that address.
                    </p>
                </Question>
            </section>

            {/* A <nav>, not a <footer>: mobile.css hides every footer on phones,
                which is where this page is read. */}
            <nav className="fd-foot" aria-label="Terms and privacy">
                <Link to="/terms">Terms of Service</Link>
                <span aria-hidden="true">·</span>
                <Link to="/privacy">Privacy Policy</Link>
            </nav>
        </div>
    )
}
