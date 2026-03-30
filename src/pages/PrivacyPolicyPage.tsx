/**
 * PrivacyPolicyPage — Legal compliance page.
 * Nitrate Noir themed, clean readability.
 */
import { Link } from 'react-router-dom'
import PageSEO from '../components/PageSEO'
import { ArrowLeft, Shield } from 'lucide-react'

export default function PrivacyPolicyPage() {
    return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '5.5rem 1.5rem 5rem' }}>
            <PageSEO title="Privacy Policy" description="The ReelHouse Society privacy policy — how we handle your data." path="/privacy" />

            {/* Back */}
            <Link to="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', textDecoration: 'none', marginBottom: '2rem', transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
            >
                <ArrowLeft size={14} /> BACK TO SETTINGS
            </Link>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid rgba(139,105,20,0.12)', position: 'relative' }}>
                <Shield size={28} color="var(--sepia)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.75rem' }}>
                    Privacy Policy
                </h1>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                    LAST UPDATED: MARCH 2026
                </div>
            </div>

            {/* Content */}
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', lineHeight: 1.8 }}>

                <Section title="1. Introduction">
                    <p>The ReelHouse Society ("we," "our," or "us") operates the web application at the-reelhouse-society.vercel.app. This Privacy Policy explains how we collect, use, and protect your personal information when you use our platform.</p>
                    <p>By creating an account or using The ReelHouse Society, you agree to the practices described in this policy.</p>
                </Section>

                <Section title="2. Information We Collect">
                    <p><strong>Account Information:</strong> When you register, we collect your email address, username, and password (securely hashed). You may optionally provide a display name, profile photo, and bio.</p>
                    <p><strong>Activity Data:</strong> We store the film logs, reviews, ratings, lists, and comments you create within the platform. This data is necessary to provide the core service.</p>
                    <p><strong>Interactions:</strong> We track certifications, reactions, follows, and other social interactions to power community features like notifications, The Pulse, and featured critiques.</p>
                    <p><strong>Technical Data:</strong> We may collect basic analytics such as device type and browser information to improve the user experience. We do not use third-party trackers or advertising pixels.</p>
                </Section>

                <Section title="3. How We Use Your Information">
                    <ul>
                        <li>To provide, maintain, and improve the platform</li>
                        <li>To display your public profile, logs, and lists to other members</li>
                        <li>To deliver notifications about social interactions</li>
                        <li>To enforce our Terms of Service and community guidelines</li>
                        <li>To respond to support requests</li>
                    </ul>
                    <p>We never sell your personal data to third parties.</p>
                </Section>

                <Section title="4. Data Storage & Security">
                    <p>Your data is stored securely using <strong>Supabase</strong> (hosted on AWS infrastructure) with row-level security policies enforced at the database level. Passwords are hashed using industry-standard bcrypt encryption.</p>
                    <p>All data transmission between your browser and our servers is encrypted via HTTPS/TLS.</p>
                </Section>

                <Section title="5. Your Privacy Controls">
                    <ul>
                        <li><strong>Social Visibility:</strong> Control whether your profile is Public, Followers-Only, or Private</li>
                        <li><strong>Certification & Annotation Privacy:</strong> Choose who can certify or comment on your logs</li>
                        <li><strong>Notification Preferences:</strong> Toggle specific notification types on or off</li>
                        <li><strong>Data Export:</strong> Export your data in CSV format from your profile page</li>
                        <li><strong>Account Deletion:</strong> Request permanent deletion through Settings</li>
                    </ul>
                </Section>

                <Section title="6. Third-Party Services">
                    <ul>
                        <li><strong>Supabase:</strong> Database and authentication infrastructure</li>
                        <li><strong>Vercel:</strong> Application hosting and deployment</li>
                        <li><strong>TMDB API:</strong> Film metadata and poster images (subject to <a href="https://www.themoviedb.org/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sepia)' }}>TMDB's Privacy Policy</a>)</li>
                    </ul>
                    <p>We do not integrate any advertising networks, social media trackers, or analytics platforms that track individual users.</p>
                </Section>

                <Section title="7. Cookies">
                    <p>We use essential cookies and local storage tokens solely for authentication (keeping you logged in). We do not use advertising cookies or third-party tracking cookies.</p>
                </Section>

                <Section title="8. Children's Privacy">
                    <p>The ReelHouse Society is not intended for users under the age of 13. We do not knowingly collect data from children. If you believe a child has created an account, please contact us for removal.</p>
                </Section>

                <Section title="9. Data Retention">
                    <p>We retain your account data for as long as your account is active. If you delete your account, we will remove your personal data within 30 days, except where retention is required by law.</p>
                </Section>

                <Section title="10. Changes to This Policy">
                    <p>We may update this Privacy Policy from time to time. Changes will be reflected on this page with an updated "Last Updated" date. Continued use after changes constitutes acceptance.</p>
                </Section>

                <Section title="11. Contact">
                    <p>For privacy-related questions or data requests, contact us at: <span style={{ color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.05em' }}>support@reelhouse.app</span></p>
                </Section>

            </div>
        </div>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{
                fontFamily: 'var(--font-sub)',
                fontSize: '1.15rem',
                color: 'var(--parchment)',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '1px solid rgba(139,105,20,0.1)',
            }}>
                {title}
            </h2>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
            }}>
                {children}
            </div>
            <style>{`
                .settings-legal-section ul { padding-left: 1.25rem; list-style-type: '✦ '; }
                .settings-legal-section li { margin-bottom: 0.4rem; padding-left: 0.4rem; }
            `}</style>
        </div>
    )
}
