/**
 * TermsOfServicePage — Legal compliance page.
 * Nitrate Noir themed, clean readability.
 */
import { Link } from 'react-router-dom'
import PageSEO from '../components/PageSEO'
import { ArrowLeft, FileText } from 'lucide-react'

export default function TermsOfServicePage() {
    return (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '5.5rem 1.5rem 5rem' }}>
            <PageSEO title="Terms of Service" description="The ReelHouse Society terms of service — rules and guidelines." path="/terms" />

            {/* Back */}
            <Link to="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--fog)', textDecoration: 'none', marginBottom: '2rem', transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--sepia)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}
            >
                <ArrowLeft size={14} /> BACK TO SETTINGS
            </Link>

            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid rgba(139,105,20,0.12)', position: 'relative' }}>
                <FileText size={28} color="var(--sepia)" style={{ marginBottom: '1rem', opacity: 0.6 }} />
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '0.75rem' }}>
                    Terms of Service
                </h1>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                    LAST UPDATED: MARCH 2026
                </div>
            </div>

            {/* Content */}
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--bone)', lineHeight: 1.8 }}>

                <Section title="1. Acceptance of Terms">
                    <p>By accessing or using The ReelHouse Society ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you must not use the Platform.</p>
                </Section>

                <Section title="2. Description of Service">
                    <p>The ReelHouse Society is a community-driven platform for tracking, reviewing, and discussing cinema. Users can log films, write reviews, create curated lists, and interact with other members through certifications, annotations, and reactions.</p>
                    <p>The Platform uses <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sepia)' }}>The Movie Database (TMDB)</a> API for film data. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                </Section>

                <Section title="3. Account Registration">
                    <ul>
                        <li>You must be at least 13 years old to create an account</li>
                        <li>You must provide a valid email address and choose a unique username</li>
                        <li>You are responsible for maintaining the security of your account credentials</li>
                        <li>You must not create multiple accounts for abusive purposes</li>
                        <li>You agree that all information you provide is accurate and truthful</li>
                    </ul>
                </Section>

                <Section title="4. User Content">
                    <p><strong>Ownership:</strong> You retain ownership of the reviews, logs, lists, and comments you create on the Platform ("User Content"). By posting, you grant The ReelHouse Society a non-exclusive, worldwide license to display and distribute your User Content within the Platform.</p>
                    <p><strong>Responsibility:</strong> You are solely responsible for the content you post. You must not post content that is:</p>
                    <ul>
                        <li>Illegal, harmful, threatening, abusive, or harassing</li>
                        <li>Defamatory, obscene, or offensive</li>
                        <li>Infringing on another party's intellectual property rights</li>
                        <li>Spam, advertising, or promotional material not authorized by us</li>
                        <li>Impersonating another person or entity</li>
                    </ul>
                </Section>

                <Section title="5. Community Standards">
                    <p>The ReelHouse Society is built on respect for cinema and for fellow members. We expect all users to:</p>
                    <ul>
                        <li>Engage in constructive and respectful discussion</li>
                        <li>Use the spoiler tag when discussing plot details</li>
                        <li>Respect other members' privacy and settings</li>
                        <li>Report violations through the built-in reporting system rather than retaliating</li>
                        <li>Not manipulate ratings, certifications, or engagement metrics</li>
                    </ul>
                </Section>

                <Section title="6. Content Moderation">
                    <p>We reserve the right to review, remove, or restrict any content that violates these Terms or our community standards. Our moderation system ("The Tribunal") allows community members to flag content for review.</p>
                    <p><strong>Consequences for violations may include:</strong></p>
                    <ul>
                        <li>Content removal</li>
                        <li>Temporary or permanent account silencing (read-only mode)</li>
                        <li>Account suspension or termination</li>
                    </ul>
                    <p>Moderation decisions are made at the discretion of Society administrators. We strive to be fair and transparent in all enforcement actions.</p>
                </Section>

                <Section title="7. Intellectual Property">
                    <p>The ReelHouse Society name, logo, design elements, and original code are the property of the Platform operators. You may not reproduce, distribute, or create derivative works without permission.</p>
                    <p>Film metadata, posters, and related media are provided by TMDB and are subject to their respective copyright holders and TMDB's terms of use.</p>
                </Section>

                <Section title="8. Prohibited Activities">
                    <p>You agree not to:</p>
                    <ul>
                        <li>Attempt to gain unauthorized access to any part of the Platform</li>
                        <li>Use automated scripts, bots, or scrapers without authorization</li>
                        <li>Interfere with or disrupt the Platform infrastructure</li>
                        <li>Circumvent any security features or access restrictions</li>
                        <li>Use the Platform for any commercial purpose without authorization</li>
                        <li>Collect personal information about other users without consent</li>
                    </ul>
                </Section>

                <Section title="9. Account Termination">
                    <p>You may delete your account at any time through Settings. We may suspend or terminate accounts that violate these Terms, at our sole discretion, with or without notice.</p>
                    <p>Upon account deletion, your personal data will be removed within 30 days in accordance with our Privacy Policy. Some anonymized data (such as aggregate statistics) may be retained.</p>
                </Section>

                <Section title="10. Disclaimers">
                    <p>The Platform is provided "as is" and "as available" without warranties of any kind. We do not guarantee uninterrupted access, data accuracy, or that the Platform will meet your expectations.</p>
                    <p>Film data provided via TMDB may contain inaccuracies. We are not responsible for the accuracy of third-party data.</p>
                </Section>

                <Section title="11. Limitation of Liability">
                    <p>To the maximum extent permitted by law, The ReelHouse Society shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Platform.</p>
                </Section>

                <Section title="12. Changes to Terms">
                    <p>We reserve the right to modify these Terms at any time. Changes will be reflected on this page with an updated "Last Updated" date. Continued use after changes constitutes acceptance of the new terms.</p>
                </Section>

                <Section title="13. Governing Law">
                    <p>These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising from these Terms or your use of the Platform shall be resolved through good-faith negotiation.</p>
                </Section>

                <Section title="14. Contact">
                    <p>For questions about these Terms, contact us at: <span style={{ color: 'var(--sepia)', fontFamily: 'var(--font-ui)', fontSize: '0.8rem', letterSpacing: '0.05em' }}>support@reelhouse.app</span></p>
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
        </div>
    )
}
