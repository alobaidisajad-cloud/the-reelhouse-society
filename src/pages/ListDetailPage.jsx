import { useParams, Link, useNavigate } from 'react-router-dom'
import { useFilmStore } from '../store'
import { FilmCard, SectionHeader } from '../components/UI'
import { ArrowLeft, Clock, Film } from 'lucide-react'

// Sync with ListsPage mock data
const COMMUNITY_LISTS = [
    {
        id: 'c1', title: 'Films That Rewired My Brain', user: 'the_archivist_84',
        desc: 'Before and after. You will not be the same.',
        films: [
            { id: 238, title: 'The Godfather', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg' },
            { id: 372058, title: 'Your Name', poster_path: '/q719jXXEzOoYaps6babgKnONONX.jpg' },
            { id: 12477, title: 'Grave of the Fireflies', poster_path: '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg' },
        ],
        count: 12,
    },
    {
        id: 'c2', title: 'Midnight Horror Essentials', user: 'midnight_devotee',
        desc: 'Do not watch alone. Or do. That might be worse.',
        films: [
            { id: 694, title: 'The Shining', poster_path: '/nRj5511mZdTl4saWEPoj9QroTIu.jpg' },
            { id: 346364, title: 'IT', poster_path: '/9E2y5Q7WlCVNEhP5GkVhjr85HCN.jpg' },
            { id: 299536, title: 'Avengers', poster_path: '/7WsyChQLEftFiDOVTGkv3hFpyyt.jpg' },
        ],
        count: 34,
    },
    {
        id: 'c3', title: 'Films for When You Need to Cry', user: 'weeper_in_the_dark',
        desc: 'A curated destruction of your emotional composure.',
        films: [
            { id: 12477, title: 'Grave of the Fireflies', poster_path: '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg' },
            { id: 372058, title: 'Your Name', poster_path: '/q719jXXEzOoYaps6babgKnONONX.jpg' },
            { id: 120467, title: 'Budapest', poster_path: '/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg' },
        ],
        count: 8,
    },
    {
        id: 'c4', title: 'Underrated Crime Masterpieces', user: 'contrarian_rex',
        desc: 'Not Heat. Not Godfather. The ones they forgot.',
        films: [
            { id: 590, title: 'The Hours', poster_path: '/4myDtowDJQPQnkEDB1IWGtJR1Fo.jpg' },
            { id: 238, title: 'The Godfather', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg' },
            { id: 12477, title: 'Grave of the Fireflies', poster_path: '/k9tv1rXZbOhH7eiCk378x61kNQ1.jpg' },
        ],
        count: 19,
    },
]

export default function ListDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { lists: userLists } = useFilmStore()

    // Find list either in user's created lists or community mocks
    const list = userLists.find(l => l.id.toString() === id) || COMMUNITY_LISTS.find(l => l.id === id)

    if (!list) {
        return (
            <div style={{ paddingTop: 100, textAlign: 'center', minHeight: '100vh', background: 'var(--ink)' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--sepia)' }}>Archive Missing</h1>
                <p style={{ color: 'var(--fog)', marginTop: '1rem', fontFamily: 'var(--font-ui)' }}>This collection cannot be located in the vault.</p>
                <button onClick={() => navigate(-1)} className="btn btn-ghost" style={{ marginTop: '2rem' }}>GO BACK</button>
            </div>
        )
    }

    const { title, description, desc, user, films = [], createdAt } = list
    const isMock = !!desc
    const displayDesc = description || desc
    const authorParam = user || 'YOU'

    // Format created date if real
    const displayDate = createdAt ? new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'ARCHIVE REEL'

    return (
        <div style={{ paddingTop: 70, minHeight: '100vh', background: 'var(--ink)' }}>
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                <button onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--fog)', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', marginLeft: '-0.5rem', alignSelf: 'flex-start', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--parchment)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fog)'}>
                    <ArrowLeft size={12} /> GO BACK
                </button>

                <header style={{ borderBottom: '1px solid rgba(139,105,20,0.3)', paddingBottom: '2.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.4em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                        THE STACKS — VOLUME {id}
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: 'var(--parchment)', lineHeight: 1.1, marginBottom: '1.5rem', textShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
                        {title}
                    </h1>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--sepia)' }} />
                            CURATED BY <Link to={isMock ? `/user/${authorParam}` : '#'} style={{ color: 'var(--bone)', textDecoration: 'none' }}>@{authorParam.toUpperCase()}</Link>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Film size={12} /> {films.length} ENTRIES</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={12} /> {displayDate}</div>
                    </div>

                    {displayDesc && (
                        <p style={{ marginTop: '2rem', fontFamily: 'var(--font-sub)', fontSize: '1.1rem', color: 'var(--bone)', lineHeight: 1.6, maxWidth: 800 }}>
                            {displayDesc}
                        </p>
                    )}
                </header>

                <section>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.7rem', letterSpacing: '0.2em', color: 'var(--sepia)' }}>INDEXED REELS</div>
                        <div style={{ height: 1, flex: 1, background: 'linear-gradient(90deg, transparent, rgba(139,105,20,0.2), transparent)', margin: '0 1rem' }} />
                    </div>

                    {films.length === 0 ? (
                        <div style={{ padding: '4rem 2rem', textAlign: 'center', background: 'var(--soot)', border: '1px dashed var(--ash)', borderRadius: '2px' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--sepia)', marginBottom: '0.5rem' }}>Empty Archive</div>
                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)' }}>No films have been added to this collection yet.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.5rem' }}>
                            {films.map((f, i) => (
                                <Link key={i} to={`/film/${f.id}`} style={{ textDecoration: 'none', display: 'block' }} className="fade-in-up">
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: -10, left: -10, width: 30, height: 30, background: 'var(--sepia)', color: 'var(--ink)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', fontWeight: 'bold', zIndex: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                                            {i + 1}
                                        </div>
                                        <FilmCard film={f} />
                                    </div>
                                    <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--parchment)', lineHeight: 1.2, textAlign: 'center' }}>{f.title}</div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}
