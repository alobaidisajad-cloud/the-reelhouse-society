import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, MapPin, Star, Filter, X, Navigation, Users, Check } from 'lucide-react'
import { useAuthStore, useCinemaReviewStore, useUIStore, useVenueStore } from '../store'
import toast from 'react-hot-toast'

// ── CINEMA DATABASE ──
const ALL_CINEMAS = [
    {
        id: 1, name: 'The Oracle Palace', city: 'Brooklyn', country: 'USA', location: 'Brooklyn, NY, USA',
        description: 'Established in 1934 in a converted Masonic lodge. We believe cinema is not entertainment — it is ritual.',
        vibes: ['Arthouse', 'Midnight Palace', 'Repertory'], verified: true, followers: 1247,
        lat: 40.6782, lng: -73.9442,
        nextShow: 'Nosferatu (1922) — Fri 11PM',
        image: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1200',
    },
    {
        id: 2, name: 'Lighthouse Cinema', city: 'Austin', country: 'USA', location: 'Austin, TX, USA',
        description: 'Showing the films your local multiplex is afraid of. We program for the curious and the adventurous.',
        vibes: ['Indie', 'Repertory', 'Arthouse'], verified: false, followers: 892,
        lat: 30.2672, lng: -97.7431,
        nextShow: 'Akira (1988) — Sat 7:30PM',
        image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed0963c?q=80&w=1200',
    },
    {
        id: 3, name: 'The Neon Coffin', city: 'Chicago', country: 'USA', location: 'Chicago, IL, USA',
        description: 'We only show horror. We never apologize for it.',
        vibes: ['Horror House', 'Drive-In'], verified: true, followers: 2103,
        lat: 41.8781, lng: -87.6298,
        nextShow: 'Deep Red (1975) — Fri 10:30PM',
        image: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=80&w=1200',
    },
    {
        id: 4, name: 'La Cinémathèque Noir', city: 'Paris', country: 'France', location: 'Paris, France',
        description: 'The last custodians of pre-war French cinema. Our archive holds 4,000 prints. We screen three per week.',
        vibes: ['Arthouse', 'Historic', 'Repertory'], verified: true, followers: 5821,
        lat: 48.8566, lng: 2.3522,
        nextShow: 'Breathless (1960) — Thu 8PM',
        image: 'https://images.unsplash.com/photo-1571204829887-3b8d69e4094d?q=80&w=1200',
    },
    {
        id: 5, name: 'Electric Sheep Cinema', city: 'London', country: 'UK', location: 'London, UK',
        description: 'Sci-fi, surrealism, and the uncanny. If it makes you doubt reality, it belongs on our screen.',
        vibes: ['Indie', 'Experimental', 'Arthouse'], verified: true, followers: 3340,
        lat: 51.5074, lng: -0.1278,
        nextShow: '2001: A Space Odyssey — Sat 9PM',
        image: 'https://images.unsplash.com/photo-1440404653325-ab12d1927771?q=80&w=1200',
    },
    {
        id: 6, name: 'Phantom Projector', city: 'Los Angeles', country: 'USA', location: 'Los Angeles, CA, USA',
        description: 'Where Hollywood golden-age classics meet underground midnight screenings. A temple to celluloid.',
        vibes: ['Historic', 'Midnight Palace', 'Repertory'], verified: true, followers: 4102,
        lat: 34.0522, lng: -118.2437,
        nextShow: 'Sunset Blvd. (1950) — Fri 8PM',
        image: 'https://images.unsplash.com/photo-1485093451681-d5dfd99b55b5?q=80&w=1200',
    },
    {
        id: 7, name: 'The Midnight Archive', city: 'Tokyo', country: 'Japan', location: 'Tokyo, Japan',
        description: 'Seijun Suzuki, Teshigahara, Imamura. We show the Japanese masters the West forgot to translate.',
        vibes: ['Arthouse', 'Experimental', 'Repertory'], verified: false, followers: 1890,
        lat: 35.6762, lng: 139.6503,
        nextShow: 'Woman in the Dunes — Sun 7PM',
        image: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1200',
    },
    {
        id: 8, name: 'Drive-In Americana', city: 'Nashville', country: 'USA', location: 'Nashville, TN, USA',
        description: 'The last authentic drive-in within 200 miles. Bring a blanket. We will bring the magic.',
        vibes: ['Drive-In', 'Family', 'Historic'], verified: false, followers: 678,
        lat: 36.1627, lng: -86.7816,
        nextShow: 'Grease (1978) — Sat Dusk',
        image: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=1200',
    },
    {
        id: 9, name: 'The Vault Cinema', city: 'Berlin', country: 'Germany', location: 'Berlin, Germany',
        description: 'Former cold war bunker converted into a subterranean screening room. The acoustics are extraordinary.',
        vibes: ['Experimental', 'Arthouse', 'Indie'], verified: true, followers: 2760,
        lat: 52.5200, lng: 13.4050,
        nextShow: 'Stalker (1979) — Fri 10PM',
        image: 'https://images.unsplash.com/photo-1586899028174-e7098604235b?q=80&w=1200',
    },
    {
        id: 10, name: 'IMAX Citadel', city: 'New York', country: 'USA', location: 'New York, NY, USA',
        description: 'The largest IMAX screen on the eastern seaboard. For films that demand to be felt in your chest.',
        vibes: ['IMAX', 'Historic'], verified: true, followers: 8902,
        lat: 40.7128, lng: -74.0060,
        nextShow: '2001: A Space Odyssey — Sat 2PM',
        image: 'https://images.unsplash.com/photo-1524985069026-dd778a71c7b4?q=80&w=1200',
    },
]

const ALL_VIBES = ['Arthouse', 'Drive-In', 'Historic', 'IMAX', 'Midnight Palace', 'Repertory', 'Horror House', 'Indie', 'Experimental', 'Family']
const ALL_COUNTRIES = [...new Set(ALL_CINEMAS.map(c => c.country))].sort()

function StarRating({ value, onChange, readonly = false, size = 20 }) {
    const [hovered, setHovered] = useState(0)
    return (
        <div style={{ display: 'flex', gap: '0.2rem' }}>
            {[1, 2, 3, 4, 5].map(star => (
                <Star
                    key={star}
                    size={size}
                    fill={(hovered || value) >= star ? 'var(--flicker)' : 'none'}
                    color={(hovered || value) >= star ? 'var(--flicker)' : 'var(--ash)'}
                    style={{ cursor: readonly ? 'default' : 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={() => !readonly && setHovered(star)}
                    onMouseLeave={() => !readonly && setHovered(0)}
                    onClick={() => !readonly && onChange && onChange(star)}
                />
            ))}
        </div>
    )
}

function CinemaCard({ cinema, avgRating, reviewCount }) {
    const [imgFailed, setImgFailed] = useState(false)
    return (
        <motion.div
            whileHover={{ y: -6 }}
            transition={{ type: 'spring', damping: 18, stiffness: 300 }}
            style={{
                background: 'var(--ink)', border: '1px solid var(--ash)',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                transition: 'border-color 0.3s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sepia)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ash)'}
        >
            {/* Cover Image */}
            <div style={{ height: 180, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                {!imgFailed ? (
                    <img
                        src={cinema.image} alt={cinema.name}
                        onError={() => setImgFailed(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7) sepia(0.3)', transition: 'transform 0.5s' }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--soot)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--sepia)', opacity: 0.3 }}>⬡</span>
                    </div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, var(--ink) 100%)' }} />
                {cinema.verified && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--ink)', border: '1px solid var(--flicker)', padding: '2px 8px', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--flicker)' }}>
                        ✦ VERIFIED
                    </div>
                )}
            </div>

            {/* Content */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <MapPin size={8} /> {cinema.location}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--parchment)', lineHeight: 1.1 }}>
                        {cinema.name}
                    </h3>
                </div>

                {/* Star Rating */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StarRating value={Math.round(avgRating)} readonly size={14} />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                        {avgRating > 0 ? avgRating.toFixed(1) : '—'} · {reviewCount} REVIEW{reviewCount !== 1 ? 'S' : ''}
                    </span>
                </div>

                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', lineHeight: 1.6, flex: 1 }}>
                    {cinema.description.slice(0, 90)}...
                </p>

                {/* Vibes */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {cinema.vibes.slice(0, 3).map(v => (
                        <span key={v} className="tag tag-vibe" style={{ fontSize: '0.48rem', padding: '2px 6px' }}>⟡ {v}</span>
                    ))}
                </div>

                {/* Next Show + Link */}
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--ash)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.08em', color: 'var(--bone)' }}>
                        ▶ {cinema.nextShow}
                    </div>
                    <Link to={`/venue/${cinema.id}`} className="btn btn-primary" style={{ fontSize: '0.55rem', padding: '0.25em 0.8em', whiteSpace: 'nowrap' }}>
                        Enter
                    </Link>
                </div>
            </div>
        </motion.div>
    )
}

function ReviewModal({ cinema, onClose }) {
    const { user, isAuthenticated } = useAuthStore()
    const { openSignupModal } = useUIStore()
    const { addReview, reviews: allReviews } = useCinemaReviewStore()
    const cinemaReviews = allReviews[cinema.id] || []

    const [myRating, setMyRating] = useState(0)
    const [myReview, setMyReview] = useState('')

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!isAuthenticated) { openSignupModal(); return }
        if (!myRating) { toast.error('Please select a star rating first'); return }
        addReview(cinema.id, { username: user.username, rating: myRating, review: myReview.trim() })
        toast.success('Review submitted')
        setMyRating(0); setMyReview('')
    }

    return (
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,1,0.97)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', borderRadius: '2px', position: 'relative' }}
            >
                {/* Header */}
                <div style={{ padding: '1.5rem 1.5rem 0', position: 'sticky', top: 0, background: 'var(--soot)', borderBottom: '1px solid var(--ash)', paddingBottom: '1rem', zIndex: 1 }}>
                    <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={20} /></button>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>REVIEWS & RATINGS</div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)' }}>{cinema.name}</h2>
                </div>

                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Write Review */}
                    <div style={{ background: 'var(--ink)', border: '1px solid var(--ash)', padding: '1.25rem' }}>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>LEAVE YOUR VERDICT</div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <StarRating value={myRating} onChange={setMyRating} size={28} />
                                {myRating > 0 && (
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--flicker)' }}>
                                        {['', 'Dismal', 'Mediocre', 'Decent', 'Excellent', 'Masterclass'][myRating]}
                                    </span>
                                )}
                            </div>
                            <textarea
                                className="input"
                                placeholder="Tell the community what makes this cinema worth entering..."
                                value={myReview}
                                onChange={e => setMyReview(e.target.value)}
                                style={{ minHeight: 100 }}
                            />
                            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                                <Check size={14} /> Submit Review
                            </button>
                        </form>
                    </div>

                    {/* Existing Reviews */}
                    <div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem' }}>
                            {cinemaReviews.length} CRITIQUE{cinemaReviews.length !== 1 ? 'S' : ''} FROM THE COMMUNITY
                        </div>
                        {cinemaReviews.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', border: '1px dashed var(--ash)', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                                NO REVIEWS YET. BE THE FIRST TO CRITIQUE.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {cinemaReviews.map((r, i) => (
                                    <div key={i} style={{ background: 'var(--ink)', border: '1px solid var(--ash)', padding: '1.1rem', borderLeft: '2px solid var(--sepia)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                            <div>
                                                <span style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--flicker)' }}>@{r.username}</span>
                                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginLeft: '0.75rem' }}>
                                                    {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                            </div>
                                            <StarRating value={r.rating} readonly size={13} />
                                        </div>
                                        {r.review && (
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.83rem', color: 'var(--bone)', lineHeight: 1.7, fontStyle: 'italic' }}>
                                                "{r.review}"
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}

export default function CinemasPage() {
    const { reviews: allReviews } = useCinemaReviewStore()
    const liveVenue = useVenueStore(s => s.venue)

    const getAvg = (id) => {
        const r = allReviews[id] || []
        return r.length ? r.reduce((a, x) => a + x.rating, 0) / r.length : 0
    }

    const [query, setQuery] = useState('')
    const [selectedCountry, setSelectedCountry] = useState('')
    const [selectedCity, setSelectedCity] = useState('')
    const [selectedVibes, setSelectedVibes] = useState([])
    const [minRating, setMinRating] = useState(0)
    const [sortBy, setSortBy] = useState('followers') // 'followers' | 'rating' | 'name'
    const [showFilters, setShowFilters] = useState(false)
    const [locating, setLocating] = useState(false)
    const [activeCity, setActiveCity] = useState('')
    const [reviewModal, setReviewModal] = useState(null)

    const cities = useMemo(() => {
        const filtered = selectedCountry ? ALL_CINEMAS.filter(c => c.country === selectedCountry) : ALL_CINEMAS
        return [...new Set(filtered.map(c => c.city))].sort()
    }, [selectedCountry])

    const toggleVibe = (v) => setSelectedVibes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])

    const cinemas = useMemo(() => {
        return ALL_CINEMAS.map(c => {
            if (c.id === 1) {
                return {
                    ...c,
                    name: liveVenue.name || c.name,
                    description: liveVenue.bio || liveVenue.description || c.description,
                    vibes: liveVenue.vibes?.length ? liveVenue.vibes : c.vibes,
                    location: liveVenue.location || c.location,
                    image: liveVenue.logo || c.image,
                }
            }
            return c
        })
    }, [liveVenue])

    const filtered = useMemo(() => {
        let list = [...cinemas]
        if (query.trim()) {
            const q = query.toLowerCase()
            list = list.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.city.toLowerCase().includes(q) ||
                c.location.toLowerCase().includes(q) ||
                c.vibes.some(v => v.toLowerCase().includes(q))
            )
        }
        if (selectedCountry) list = list.filter(c => c.country === selectedCountry)
        if (selectedCity || activeCity) list = list.filter(c => c.city === (selectedCity || activeCity))
        if (selectedVibes.length) list = list.filter(c => selectedVibes.every(v => c.vibes.includes(v)))
        if (minRating > 0) list = list.filter(c => getAvg(c.id) >= minRating)
        list.sort((a, b) => {
            if (sortBy === 'rating') return getAvg(b.id) - getAvg(a.id)
            if (sortBy === 'name') return a.name.localeCompare(b.name)
            return b.followers - a.followers
        })
        return list
    }, [query, selectedCountry, selectedCity, selectedVibes, minRating, sortBy, allReviews, activeCity, cinemas])

    const handleNearMe = () => {
        if (!navigator.geolocation) { toast.error('Geolocation not supported on this browser'); return }
        setLocating(true)
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                // Find nearest cinema by Haversine distance
                const { latitude, longitude } = pos.coords
                let nearest = null, minDist = Infinity
                ALL_CINEMAS.forEach(c => {
                    const R = 6371
                    const dLat = (c.lat - latitude) * Math.PI / 180
                    const dLng = (c.lng - longitude) * Math.PI / 180
                    const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitude * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
                    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
                    if (dist < minDist) { minDist = dist; nearest = c }
                })
                setLocating(false)
                if (nearest) {
                    setActiveCity(nearest.city)
                    setSelectedCity(nearest.city)
                    toast.success(`Nearest cinema city: ${nearest.city}`)
                }
            },
            () => {
                setLocating(false)
                toast.error('Could not get your location. Please search manually.')
            },
            { timeout: 8000 }
        )
    }

    const clearFilters = () => {
        setQuery(''); setSelectedCountry(''); setSelectedCity(''); setSelectedVibes([]); setMinRating(0); setActiveCity('')
    }
    const hasFilters = query || selectedCountry || selectedCity || selectedVibes.length > 0 || minRating > 0

    return (
        <div style={{ minHeight: '100vh', paddingTop: 70 }}>
            {/* Page Header */}
            <div style={{ background: 'var(--soot)', borderBottom: '1px solid var(--ash)', padding: '3rem 0 0' }}>
                <div className="container">
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.35em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>
                        THE ATLAS OF TEMPLES
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'var(--parchment)', lineHeight: 1 }}>
                        Find a Cinema
                    </h1>
                    <p style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--fog)', marginTop: '0.75rem', marginBottom: '2rem' }}>
                        Discover independent cinemas, check showtimes, and read critiques from The ReelHouse Society community.
                    </p>

                    {/* Search */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingBottom: '1.5rem' }}>
                        <div style={{ flex: 1, minWidth: 240, position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--fog)', pointerEvents: 'none' }} />
                            <input
                                className="input"
                                placeholder="Search cinema name, city, or vibe..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                style={{ paddingLeft: '2.5rem' }}
                            />
                        </div>
                        <button
                            className={`btn ${locating ? 'btn-ghost' : 'btn-ghost'}`}
                            onClick={handleNearMe}
                            disabled={locating}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Navigation size={14} style={{ animation: locating ? 'pulse 1s infinite' : 'none' }} />
                            {locating ? 'Locating...' : 'Near Me'}
                        </button>
                        <button
                            className={`btn ${showFilters ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setShowFilters(v => !v)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            <Filter size={14} /> Filters {selectedVibes.length + (selectedCountry ? 1 : 0) + (minRating ? 1 : 0) > 0 && `(${selectedVibes.length + (selectedCountry ? 1 : 0) + (minRating ? 1 : 0)})`}
                        </button>
                        {hasFilters && (
                            <button className="btn btn-ghost" onClick={clearFilters} style={{ color: 'var(--fog)', fontSize: '0.65rem' }}>
                                <X size={14} /> Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Panel */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        style={{ background: 'var(--ink)', borderBottom: '1px solid var(--ash)', overflow: 'hidden' }}
                    >
                        <div className="container" style={{ padding: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>COUNTRY</div>
                                    <select className="input" value={selectedCountry} onChange={e => { setSelectedCountry(e.target.value); setSelectedCity('') }}>
                                        <option value="">All Countries</option>
                                        {ALL_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>CITY</div>
                                    <select className="input" value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
                                        <option value="">All Cities</option>
                                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>SORT BY</div>
                                    <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                        <option value="followers">Most Followed</option>
                                        <option value="rating">Highest Rated</option>
                                        <option value="name">Name A→Z</option>
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>MIN. RATING</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--soot)', border: '1px solid var(--ash)' }}>
                                        <StarRating value={minRating} onChange={setMinRating} size={18} />
                                        {minRating > 0 && <button onClick={() => setMinRating(0)} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer', padding: 0 }}><X size={12} /></button>}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>VIBE TAGS</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {ALL_VIBES.map(v => (
                                        <button key={v} type="button"
                                            className={`tag ${selectedVibes.includes(v) ? 'tag-flicker' : 'tag-vibe'}`}
                                            onClick={() => toggleVibe(v)} style={{ cursor: 'pointer' }}
                                        >⟡ {v}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results */}
            <main className="container" style={{ paddingTop: '2.5rem', paddingBottom: '6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.2em', color: 'var(--fog)' }}>
                        {filtered.length} CINEMA{filtered.length !== 1 ? 'S' : ''} {hasFilters ? 'MATCHING FILTERS' : 'IN THE ATLAS'}
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '5rem 2rem', border: '1px dashed var(--ash)' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--sepia)', marginBottom: '0.75rem' }}>No Temples Found</div>
                        <p style={{ fontFamily: 'var(--font-sub)', color: 'var(--fog)', fontSize: '0.85rem' }}>Try adjusting your search or filters.</p>
                        <button className="btn btn-ghost" onClick={clearFilters} style={{ marginTop: '1.5rem' }}>Clear all filters</button>
                    </div>
                ) : (
                    <motion.div layout style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        <AnimatePresence>
                            {filtered.map((cinema, i) => {
                                const avg = getAvg(cinema.id)
                                const count = (allReviews[cinema.id] || []).length
                                return (
                                    <motion.div
                                        key={cinema.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.2 }}
                                        style={{ display: 'flex', flexDirection: 'column' }}
                                    >
                                        <CinemaCard cinema={cinema} avgRating={avg} reviewCount={count} />
                                        <button
                                            onClick={() => setReviewModal(cinema)}
                                            className="btn btn-ghost"
                                            style={{ borderTop: 'none', borderRadius: 0, fontSize: '0.58rem', justifyContent: 'center', letterSpacing: '0.15em', gap: '0.35rem' }}
                                        >
                                            <Star size={11} /> Read / Write Reviews
                                        </button>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </motion.div>
                )}
            </main>

            {/* Review Modal */}
            <AnimatePresence>
                {reviewModal && <ReviewModal cinema={reviewModal} onClose={() => setReviewModal(null)} />}
            </AnimatePresence>
        </div>
    )
}
