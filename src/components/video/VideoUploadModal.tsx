import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Film, Search, Check, Loader } from 'lucide-react'
import { tmdb } from '../../tmdb'
import { useVideoStore } from '../../stores/video'
import { Portal } from '../UI'
import { useAuthStore } from '../../store'
import toast from 'react-hot-toast'

interface VideoUploadModalProps {
    onClose: () => void
    onSuccess?: () => void
}

export default function VideoUploadModal({ onClose, onSuccess }: VideoUploadModalProps) {
    const { user } = useAuthStore()
    const { uploadVideo, uploading, uploadProgress } = useVideoStore()
    const fileRef = useRef<HTMLInputElement>(null)

    const [file, setFile] = useState<File | null>(null)
    const [title, setTitle] = useState('')
    const [filmQuery, setFilmQuery] = useState('')
    const [filmResults, setFilmResults] = useState<any[]>([])
    const [selectedFilm, setSelectedFilm] = useState<any>(null)
    const [searching, setSearching] = useState(false)

    // Film autocomplete
    useEffect(() => {
        if (!filmQuery.trim() || filmQuery.length < 2) { setFilmResults([]); return }
        setSearching(true)
        const timer = setTimeout(async () => {
            try {
                const results = await tmdb.search(filmQuery.trim(), 1)
                setFilmResults((results?.results || []).slice(0, 6))
            } catch { }
            finally { setSearching(false) }
        }, 300)
        return () => clearTimeout(timer)
    }, [filmQuery])

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f && (f.type === 'video/mp4' || f.type === 'video/webm')) setFile(f)
        else toast.error('Only MP4 and WebM formats are supported.')
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]
        if (!f) return
        if (f.type !== 'video/mp4' && f.type !== 'video/webm') {
            toast.error('Only MP4 and WebM formats are supported.')
            return
        }
        if (f.size > 500 * 1024 * 1024) {
            toast.error('Maximum file size is 500MB.')
            return
        }
        setFile(f)
    }

    const handleSubmit = async () => {
        if (!file) { toast.error('Select a video file.'); return }
        if (!title.trim()) { toast.error('Enter a title for your review.'); return }
        if (!selectedFilm) { toast.error('Select the film you are reviewing.'); return }
        if (!user) return

        const ok = await uploadVideo({
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            filmId: selectedFilm.id,
            filmTitle: selectedFilm.title || selectedFilm.name,
            filmPoster: selectedFilm.poster_path,
            title: title.trim(),
            file,
        })

        if (ok) {
            toast.success('Video published to the Archive! ✦', { icon: '🎬' })
            onSuccess?.()
            onClose()
        } else {
            toast.error('Upload failed. Please try again.')
        }
    }

    return (
        <Portal>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,3,1,0.97)', padding: '1rem', overflowY: 'auto' }} onClick={onClose}
                >
                    <motion.div
                        className="modal-panel"
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'var(--soot)', border: '1px solid var(--sepia)', borderRadius: '2px', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}
                    >
                        {/* Header */}
                        <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--ash)', position: 'sticky', top: 0, background: 'var(--soot)', zIndex: 1 }}>
                            <button onClick={onClose} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={20} /></button>
                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.3em', color: 'var(--sepia)', marginBottom: '0.25rem' }}>THE SCREENING ROOM</div>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)' }}>Upload Video Review</h2>
                        </div>

                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Drop Zone */}
                            <div
                                onDragOver={e => e.preventDefault()}
                                onDrop={handleFileDrop}
                                onClick={() => fileRef.current?.click()}
                                style={{
                                    border: `2px dashed ${file ? 'var(--sepia)' : 'var(--ash)'}`,
                                    borderRadius: '2px', padding: '2.5rem 1.5rem', textAlign: 'center',
                                    cursor: 'pointer', transition: 'border-color 0.2s',
                                    background: file ? 'rgba(139,105,20,0.05)' : 'transparent',
                                }}
                            >
                                <input ref={fileRef} type="file" accept="video/mp4,video/webm" onChange={handleFileSelect} style={{ display: 'none' }} />
                                {file ? (
                                    <>
                                        <Check size={28} color="var(--sepia)" style={{ marginBottom: '0.5rem' }} />
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>{file.name}</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.25rem' }}>
                                            {(file.size / (1024 * 1024)).toFixed(1)} MB · Click to change
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={28} color="var(--fog)" style={{ marginBottom: '0.5rem' }} />
                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.9rem', color: 'var(--parchment)' }}>Drop your video here</div>
                                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.1em', marginTop: '0.25rem' }}>
                                            MP4 or WebM · Max 500MB · Up to 10 minutes · 1080p
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Title */}
                            <div>
                                <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', display: 'block', marginBottom: '0.4rem' }}>REVIEW TITLE</label>
                                <input className="input" placeholder="e.g. Why This Film Changed Everything..." value={title} onChange={e => setTitle(e.target.value)} style={{ width: '100%' }} maxLength={120} />
                            </div>

                            {/* Film Selection */}
                            <div style={{ position: 'relative' }}>
                                <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', display: 'block', marginBottom: '0.4rem' }}>FILM REVIEWED</label>
                                {selectedFilm ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(139,105,20,0.08)', border: '1px solid var(--sepia)', borderRadius: '2px' }}>
                                        {selectedFilm.poster_path && (
                                            <img src={`https://image.tmdb.org/t/p/w92${selectedFilm.poster_path}`} alt="" style={{ width: 32, height: 48, objectFit: 'cover', borderRadius: '2px' }} />
                                        )}
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.85rem', color: 'var(--parchment)' }}>{selectedFilm.title || selectedFilm.name}</div>
                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.08em' }}>{selectedFilm.release_date?.slice(0, 4) || 'TBA'}</div>
                                        </div>
                                        <button onClick={() => { setSelectedFilm(null); setFilmQuery('') }} style={{ background: 'none', border: 'none', color: 'var(--fog)', cursor: 'pointer' }}><X size={14} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--fog)', pointerEvents: 'none' }} />
                                            <input className="input" placeholder="Search for the film..." value={filmQuery} onChange={e => setFilmQuery(e.target.value)} style={{ width: '100%', paddingLeft: '2.2rem' }} />
                                        </div>
                                        {(filmResults.length > 0 || searching) && (
                                            <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: 'var(--ink)', border: '1px solid var(--ash)', borderTop: 'none', borderRadius: '0 0 2px 2px', maxHeight: 200, overflowY: 'auto' }}>
                                                {searching && <div style={{ padding: '0.75rem', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', color: 'var(--fog)', letterSpacing: '0.15em' }}><Loader size={10} style={{ display: 'inline', animation: 'spin 1s linear infinite', marginRight: '0.4rem' }} />SEARCHING...</div>}
                                                {filmResults.filter((f: any) => f.media_type !== 'person').map((film: any) => (
                                                    <div
                                                        key={film.id}
                                                        onClick={() => { setSelectedFilm(film); setFilmResults([]); setFilmQuery('') }}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid rgba(139,105,20,0.05)' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(242,232,160,0.04)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        {film.poster_path ? (
                                                            <img src={`https://image.tmdb.org/t/p/w92${film.poster_path}`} alt="" style={{ width: 24, height: 36, objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />
                                                        ) : (
                                                            <div style={{ width: 24, height: 36, background: 'var(--ash)', borderRadius: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Film size={10} color="var(--fog)" /></div>
                                                        )}
                                                        <div>
                                                            <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.8rem', color: 'var(--parchment)' }}>{film.title || film.name}</div>
                                                            <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', color: 'var(--fog)' }}>{film.release_date?.slice(0, 4) || 'TBA'}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Upload Progress */}
                            {uploading && (
                                <div>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.4rem' }}>
                                        UPLOADING TO THE ARCHIVE... {uploadProgress}%
                                    </div>
                                    <div style={{ width: '100%', height: 4, background: 'var(--ash)', borderRadius: '2px', overflow: 'hidden' }}>
                                        <motion.div
                                            animate={{ width: `${uploadProgress}%` }}
                                            style={{ height: '100%', background: 'var(--sepia)' }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={uploading || !file || !title.trim() || !selectedFilm}
                                style={{ width: '100%', justifyContent: 'center', padding: '1rem', fontSize: '0.8rem', letterSpacing: '0.2em', opacity: (uploading || !file || !title.trim() || !selectedFilm) ? 0.5 : 1 }}
                            >
                                {uploading ? 'UPLOADING...' : '✦ PUBLISH TO THE SCREENING ROOM'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        </Portal>
    )
}
