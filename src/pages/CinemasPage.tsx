import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, MapPin, Star, Filter, X, Check, Building2, ArrowRight, Navigation, Loader } from 'lucide-react'
import { useAuthStore, useCinemaReviewStore, useUIStore } from '../store'
import { supabase } from '../supabaseClient'
import { useQuery } from '@tanstack/react-query'
import { LoadingReel } from '../components/UI'
import toast from 'react-hot-toast'

// Haversine distance in km between two lat/lng points
function haversineKm(lat1: any, lng1: any, lat2: any, lng2: any) {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── STAR RATING ──
function StarRating({ value, onChange, readonly = false, size = 20 }: any) {
    const [hovered, setHovered] = useState(0)
    return (
        <div style={{ display: 'flex', gap: 3 }}>
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

// ── CINEMA CARD ──
function CinemaCard({ cinema, avgRating, reviewCount, distanceKm }: any) {
    const [imgFailed, setImgFailed] = useState(!cinema.image)

    // deterministic gradient from name
    const gradients = [
        'linear-gradient(135deg, #130e07 0%, #2a1f0a 100%)',
        'linear-gradient(135deg, #0a0a14 0%, #101030 100%)',
        'linear-gradient(135deg, #0f0303 0%, #1a0808 100%)',
        'linear-gradient(135deg, #080f0a 0%, #0d2010 100%)',
        'linear-gradient(135deg, #0c0c0c 0%, #181818 100%)',
    ]
    const grad = gradients[(cinema.name?.charCodeAt(0) || 0) % gradients.length]

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
                {!imgFailed && cinema.image ? (
                    <img
                        src={cinema.image} alt={cinema.name}
                        onError={() => setImgFailed(true)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.7) sepia(0.3)', transition: 'transform 0.5s' }}
                    />
                ) : (
                    <div style={{ width: '100%', height: '100%', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--sepia)', opacity: 0.3 }}>⬡</span>
                    </div>
                )}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, var(--ink) 100%)' }} />
                {cinema.verified && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: 'var(--ink)', border: '1px solid var(--flicker)', padding: '2px 8px', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--flicker)' }}>
                        ✦ VERIFIED
                    </div>
                )}
                {distanceKm != null && (
                    <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(5,3,1,0.85)', border: '1px solid var(--sepia)', padding: '2px 8px', fontFamily: 'var(--font-ui)', fontSize: '0.48rem', letterSpacing: '0.12em', color: 'var(--sepia)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Navigation size={8} />{distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m away` : `${distanceKm.toFixed(1)} km away`}
                    </div>
                )}
            </div>

            {/* Content */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <MapPin size={8} /> {cinema.location || 'Location TBC'}
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--parchment)', lineHeight: 1.1 }}>
                        {cinema.name}
                    </h3>
                </div>

                {/* Rating */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StarRating value={Math.round(avgRating)} readonly size={14} />
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', color: 'var(--fog)', letterSpacing: '0.1em' }}>
                        {avgRating > 0 ? avgRating.toFixed(1) : '—'} · {reviewCount} REVIEW{reviewCount !== 1 ? 'S' : ''}
                    </span>
                </div>

                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--fog)', lineHeight: 1.6, flex: 1 }}>
                    {(cinema.description || '').slice(0, 100)}{cinema.description?.length > 100 ? '…' : ''}
                </p>

                {/* Vibes */}
                {cinema.vibes?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {cinema.vibes.slice(0, 3).map((v: any) => (
                            <span key={v} className="tag tag-vibe" style={{ fontSize: '0.48rem', padding: '2px 6px' }}>⟡ {v}</span>
                        ))}
                    </div>
                )}

                {/* Footer — venue link */}
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--ash)', display: 'flex', justifyContent: 'flex-end' }}>
                    <Link to={`/venue/${cinema.id}`} className="btn btn-primary" style={{ fontSize: '0.55rem', padding: '0.25em 0.8em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        Enter <ArrowRight size={10} />
                    </Link>
                </div>
            </div>
        </motion.div>
    )
}

// ── REVIEW MODAL ──
function ReviewModal({ cinema, onClose }: any) {
    const { user, isAuthenticated } = useAuthStore()
    const { openSignupModal } = useUIStore()
    const { addReview, reviews: allReviews, fetchReviews } = useCinemaReviewStore()
    const cinemaReviews = allReviews[cinema.id] || []

    const [myRating, setMyRating] = useState(0)
    const [myReview, setMyReview] = useState('')

    useEffect(() => { fetchReviews(cinema.id) }, [cinema.id])

    const handleSubmit = async (e: any) => {
        e.preventDefault()
        if (!isAuthenticated) { openSignupModal(); return }
        if (!myRating) { toast.error('Please select a star rating first'); return }
        await addReview(cinema.id, cinema.name, { username: user.username, rating: myRating, review: myReview.trim() })
        toast.success('Review submitted to the archive')
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
                <div style={{ padding: '1.5rem 1.5rem 1rem', position: 'sticky', top: 0, background: 'var(--soot)', borderBottom: '1px solid var(--ash)', zIndex: 1 }}>
                    <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={20} /></button>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>REVIEWS & RATINGS</div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)' }}>{cinema.name}</h2>
                </div>

                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                                onChange={(e: any) => setMyReview(e.target.value)}
                                style={{ minHeight: 100 }}
                            />
                            <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
                                <Check size={14} /> Submit Review
                            </button>
                        </form>
                    </div>

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
                                {cinemaReviews.map((r: any, i: number) => (
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

// ── MAIN PAGE ──
export default function CinemasPage() {
    const { reviews: allReviews, fetchReviews } = useCinemaReviewStore()

    const getAvg = (id: any) => {
        const r = allReviews[id] || []
        return r.length ? r.reduce((a: any, x: any) => a + x.rating, 0) / r.length : 0
    }

    const [query, setQuery] = useState('')
    const [selectedVibes, setSelectedVibes] = useState<any[]>([])
    const [minRating, setMinRating] = useState(0)
    const [sortBy, setSortBy] = useState('newest')
    const [showFilters, setShowFilters] = useState(false)
    const [reviewModal, setReviewModal] = useState<any>(null)

    // Geolocation state
    const [userLocation, setUserLocation] = useState<{lat:number;lng:number}|null>(null)  // { lat, lng }
    const [geoLoading, setGeoLoading] = useState(false)

    const findNearest = useCallback(() => {
        if (!navigator.geolocation) { toast.error('Geolocation not supported by your browser'); return }
        setGeoLoading(true)
        navigator.geolocation.getCurrentPosition(
            (pos: any) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                setSortBy('distance')
                setGeoLoading(false)
                toast.success('Location detected — sorting by distance')
            },
            (err: any) => {
                setGeoLoading(false)
                if (err.code === 1) toast.error('Location access denied. Enable it in your browser settings.')
                else toast.error('Could not get your location')
            },
            { timeout: 10000, maximumAge: 60000 }
        )
    }, [])

    // Fetch ALL venues from Supabase (not just owner's)
    const { data: venues = [], isLoading } = useQuery({
        queryKey: ['all-venues'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('venues')
                .select('*')
                .order('created_at', { ascending: false })
            return data || []
        },
        staleTime: 1000 * 60 * 5,
    })

    // Fetch reviews for each loaded venue
    useEffect(() => {
        venues.forEach((v: any) => { if (!allReviews[v.id]) fetchReviews(v.id) })
    }, [venues, fetchReviews]) // eslint-disable-line react-hooks/exhaustive-deps

    // Derive unique vibes from real venue data
    const allVibes = useMemo(() => {
        const vibeSet = new Set()
        venues.forEach((v: any) => (v.vibes || []).forEach((vibe: any) => vibeSet.add(vibe)))
        return [...vibeSet].sort()
    }, [venues])

    const toggleVibe = (v: any) => setSelectedVibes((prev: any) => prev.includes(v) ? prev.filter((x: any) => x !== v) : [...prev, v])

    const filtered = useMemo(() => {
        let list = [...venues]
        if (query.trim()) {
            const q = query.toLowerCase()
            list = list.filter((c: any) =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.location || '').toLowerCase().includes(q) ||
                (c.vibes || []).some((v: any) => v.toLowerCase().includes(q))
            )
        }
        if (selectedVibes.length) list = list.filter((c: any) => selectedVibes.every((v: any) => (c.vibes || []).includes(v)))
        if (minRating > 0) list = list.filter((c: any) => getAvg(c.id) >= minRating)

        // Compute distance for each venue if user location known
        if (userLocation) {
            list = list.map((c: any) => ({
                ...c,
                _distKm: (c.lat && c.lng) ? haversineKm(userLocation.lat, userLocation.lng, c.lat, c.lng) : null
            }))
        }

        list.sort((a: any, b: any) => {
            if (sortBy === 'distance' && userLocation) {
                // venues without lat/lng go to end
                if (a._distKm == null && b._distKm == null) return 0
                if (a._distKm == null) return 1
                if (b._distKm == null) return -1
                return a._distKm - b._distKm
            }
            if (sortBy === 'rating') return getAvg(b.id) - getAvg(a.id)
            if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '')
            return 0 // 'newest' already sorted by Supabase
        })
        return list
    }, [venues, query, selectedVibes, minRating, sortBy, allReviews, userLocation])

    const hasFilters = query || selectedVibes.length > 0 || minRating > 0
    const clearFilters = () => { setQuery(''); setSelectedVibes([]); setMinRating(0) }

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

                    {/* Search Row */}
                    <div className="cinemas-search-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingBottom: '1.5rem' }}>
                        <div style={{ flex: 1, minWidth: 240, position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={16} style={{ position: 'absolute', left: '0.75rem', color: 'var(--fog)', pointerEvents: 'none' }} />
                            <input
                                className="input"
                                placeholder="Search cinema name, location, or vibe..."
                                value={query}
                                onChange={(e: any) => setQuery(e.target.value)}
                                style={{ paddingLeft: '2.5rem' }}
                            />
                        </div>
                        {/* Find Nearest button */}
                        <button
                            className={`btn ${userLocation ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={userLocation ? () => { setUserLocation(null); setSortBy('newest'); toast('Location cleared') } : findNearest}
                            disabled={geoLoading}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 120 }}
                        >
                            {geoLoading ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={13} />}
                            {geoLoading ? 'Locating...' : userLocation ? 'Clear Location' : 'Find Nearest'}
                        </button>
                        {allVibes.length > 0 && (
                            <button
                                className={`btn ${showFilters ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setShowFilters(v => !v)}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <Filter size={14} /> Filters {selectedVibes.length + (minRating ? 1 : 0) > 0 && `(${selectedVibes.length + (minRating ? 1 : 0)})`}
                            </button>
                        )}
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
                {showFilters && allVibes.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        style={{ background: 'var(--ink)', borderBottom: '1px solid var(--ash)', overflow: 'hidden' }}
                    >
                        <div className="container" style={{ padding: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.15em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>SORT BY</div>
                                    <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                        <option value="newest">Newest First</option>
                                        <option value="rating">Highest Rated</option>
                                        <option value="name">Name A→Z</option>
                                        {userLocation && <option value="distance">Nearest First</option>}
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
                                    {allVibes.map((v: any) => (
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

                {isLoading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} style={{ background: 'var(--soot)', border: '1px solid var(--ash)', borderRadius: '2px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div className="shimmer" style={{ height: 48, width: 48, borderRadius: '6px', animationDelay: `${i * 0.08}s` }} />
                                <div className="shimmer" style={{ height: '1.1rem', width: '65%', borderRadius: '2px', animationDelay: `${i * 0.08 + 0.1}s` }} />
                                <div className="shimmer" style={{ height: '0.65rem', width: '40%', borderRadius: '2px', animationDelay: `${i * 0.08 + 0.15}s` }} />
                                <div className="shimmer" style={{ height: '0.6rem', width: '80%', borderRadius: '2px', animationDelay: `${i * 0.08 + 0.2}s` }} />
                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                                    {[1, 2, 3].map(j => <div key={j} className="shimmer" style={{ height: '1rem', width: 50, borderRadius: '2px', animationDelay: `${i * 0.08 + 0.25}s` }} />)}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : venues.length === 0 && !hasFilters ? (
                    /* Empty state — no venues in DB yet */
                    <div style={{ textAlign: 'center', padding: '6rem 1rem', border: '1px dashed rgba(139,105,20,0.2)', borderRadius: '2px', maxWidth: 560, margin: '0 auto' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--sepia)', marginBottom: '1rem', lineHeight: 1.1 }}>
                            The Atlas Awaits Its<br />First Guardians
                        </div>
                        <p style={{ fontFamily: 'var(--font-sub)', fontSize: '1rem', color: 'var(--fog)', lineHeight: 1.6, maxWidth: 380, margin: '0 auto 2rem' }}>
                            No cinemas have joined the archive yet. If you run an independent venue, claim your place on the map.
                        </p>
                        <Link to="/venue-dashboard" className="btn btn-primary" style={{ padding: '0.8rem 2.5rem', letterSpacing: '0.2em' }}>
                            <Building2 size={14} /> Register Your Venue
                        </Link>
                    </div>
                ) : (
                    <>
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
                                    {filtered.map((cinema: any, i: number) => {
                                        const avg = getAvg(cinema.id)
                                        const count = (allReviews[cinema.id] || []).length
                                        const mapped = {
                                            id: cinema.id,
                                            name: cinema.name,
                                            location: cinema.location,
                                            description: cinema.description || cinema.bio,
                                            vibes: cinema.vibes || [],
                                            verified: cinema.verified || false,
                                            image: cinema.logo || null,
                                        }
                                        return (
                                            <motion.div
                                                key={cinema.id} layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                transition={{ duration: 0.2, delay: i * 0.04 }}
                                                style={{ display: 'flex', flexDirection: 'column' }}
                                            >
                                                <CinemaCard cinema={mapped} avgRating={avg} reviewCount={count} distanceKm={cinema._distKm ?? null} />
                                                <button
                                                    onClick={() => setReviewModal(mapped)}
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
                    </>
                )}
            </main>

            {/* Review Modal */}
            <AnimatePresence>
                {reviewModal && <ReviewModal cinema={reviewModal} onClose={() => setReviewModal(null)} />}
            </AnimatePresence>
        </div>
    )
}
