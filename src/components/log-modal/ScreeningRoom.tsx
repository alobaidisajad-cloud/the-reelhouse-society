import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Video, Upload, X, Film, Check } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store'
import toast from 'react-hot-toast'

const MAX_SIZE_MB = 500
const MAX_DURATION_SEC = 600 // 10 minutes
const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']

interface ScreeningRoomProps {
    videoUrl: string | null
    setVideoUrl: (url: string | null) => void
    filmId: number
}

export default function ScreeningRoom({ videoUrl, setVideoUrl, filmId }: ScreeningRoomProps) {
    const user = useAuthStore(state => state.user)
    const [uploading, setUploading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [dragOver, setDragOver] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const videoPreviewRef = useRef<HTMLVideoElement>(null)

    const validateFile = useCallback((file: File): Promise<boolean> => {
        return new Promise((resolve) => {
            // Type check
            if (!ALLOWED_TYPES.includes(file.type)) {
                toast.error('Unsupported format. Use MP4, WebM, or MOV.', { icon: '🎬' })
                resolve(false)
                return
            }
            // Size check
            if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                toast.error(`File too large. Maximum ${MAX_SIZE_MB}MB.`, { icon: '🎬' })
                resolve(false)
                return
            }
            // Duration check
            const video = document.createElement('video')
            video.preload = 'metadata'
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(video.src)
                if (video.duration > MAX_DURATION_SEC) {
                    toast.error(`Video too long (${Math.ceil(video.duration / 60)} min). Max 10 minutes.`, { icon: '🎬' })
                    resolve(false)
                } else {
                    resolve(true)
                }
            }
            video.onerror = () => {
                URL.revokeObjectURL(video.src)
                toast.error('Could not read video file.')
                resolve(false)
            }
            video.src = URL.createObjectURL(file)
        })
    }, [])

    const uploadVideo = useCallback(async (file: File) => {
        if (!user?.id) return
        const valid = await validateFile(file)
        if (!valid) return

        setUploading(true)
        setProgress(0)

        const ext = file.name.split('.').pop() || 'mp4'
        const path = `${user.id}/${Date.now()}_${filmId}.${ext}`

        // Simulate progress since supabase doesn't provide real upload progress
        const progressInterval = setInterval(() => {
            setProgress(prev => Math.min(prev + Math.random() * 15, 90))
        }, 300)

        try {
            const { data, error } = await supabase.storage
                .from('screening-room')
                .upload(path, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type,
                })

            clearInterval(progressInterval)

            if (error) {
                toast.error('Upload failed. Try again.')
                setUploading(false)
                setProgress(0)
                return
            }

            const { data: urlData } = supabase.storage
                .from('screening-room')
                .getPublicUrl(data.path)

            setProgress(100)
            setVideoUrl(urlData.publicUrl)
            toast.success('Video uploaded to the Screening Room.', {
                icon: '🎬',
                style: { background: 'var(--ink)', color: 'var(--parchment)', border: '1px solid rgba(196,135,42,0.4)' }
            })
        } catch {
            clearInterval(progressInterval)
            toast.error('Upload failed unexpectedly.')
        } finally {
            setTimeout(() => {
                setUploading(false)
                setProgress(0)
            }, 500)
        }
    }, [user, filmId, validateFile, setVideoUrl])

    const removeVideo = useCallback(async () => {
        if (!videoUrl || !user?.id) return
        // Extract the path from the full URL
        try {
            const urlParts = videoUrl.split('/screening-room/')
            if (urlParts[1]) {
                await supabase.storage.from('screening-room').remove([urlParts[1]])
            }
        } catch { /* cleanup is best-effort */ }
        setVideoUrl(null)
        toast('Video removed.', { icon: '✦' })
    }, [videoUrl, user, setVideoUrl])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file) uploadVideo(file)
    }, [uploadVideo])

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) uploadVideo(file)
        e.target.value = '' // Reset for re-upload
    }, [uploadVideo])

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60)
        const s = Math.floor(sec % 60)
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    return (
        <div style={{
            padding: '1rem',
            border: '1px solid rgba(196,135,42,0.3)',
            borderRadius: 'var(--radius-card)',
            background: 'linear-gradient(135deg, rgba(196,135,42,0.04) 0%, rgba(162,36,36,0.04) 100%)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: videoUrl || uploading ? '1rem' : 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                        width: 28, height: 28,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(196,135,42,0.2), rgba(162,36,36,0.2))',
                        border: '1px solid rgba(196,135,42,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Film size={13} color="#c4872a" />
                    </div>
                    <div>
                        <div style={{
                            fontFamily: 'var(--font-display)', fontSize: '0.85rem',
                            color: '#c4872a',
                        }}>
                            THE SCREENING ROOM
                        </div>
                        <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.4rem',
                            letterSpacing: '0.2em', color: 'var(--fog)',
                        }}>
                            PROJECTIONIST EXCLUSIVE · UP TO 10 MIN · 1080P
                        </div>
                    </div>
                </div>
                {videoUrl && (
                    <button
                        onClick={removeVideo}
                        style={{
                            background: 'rgba(162,36,36,0.15)',
                            border: '1px solid rgba(162,36,36,0.3)',
                            borderRadius: '50%',
                            width: 24, height: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(162,36,36,0.3)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(162,36,36,0.15)' }}
                        title="Remove video"
                    >
                        <X size={11} color="var(--blood-reel)" />
                    </button>
                )}
            </div>

            <AnimatePresence mode="wait">
                {/* Upload progress */}
                {uploading && (
                    <motion.div
                        key="uploading"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                    >
                        <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.5rem',
                            letterSpacing: '0.15em', color: '#c4872a',
                            textAlign: 'center',
                        }}>
                            {progress >= 100 ? '✦ PROCESSING COMPLETE' : '◎ UPLOADING TO THE SCREENING ROOM...'}
                        </div>
                        <div style={{
                            height: 4, borderRadius: 2,
                            background: 'rgba(255,255,255,0.05)',
                            overflow: 'hidden',
                        }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.3 }}
                                style={{
                                    height: '100%', borderRadius: 2,
                                    background: progress >= 100
                                        ? 'linear-gradient(90deg, #4a9c4a, #6bc76b)'
                                        : 'linear-gradient(90deg, #c4872a, var(--blood-reel))',
                                    boxShadow: '0 0 12px rgba(196,135,42,0.4)',
                                }}
                            />
                        </div>
                        <div style={{
                            fontFamily: 'var(--font-ui)', fontSize: '0.45rem',
                            color: 'var(--fog)', textAlign: 'center',
                        }}>
                            {Math.round(progress)}%
                        </div>
                    </motion.div>
                )}

                {/* Video preview */}
                {videoUrl && !uploading && (
                    <motion.div
                        key="preview"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                    >
                        <div style={{
                            position: 'relative',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: '1px solid rgba(196,135,42,0.2)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        }}>
                            <video
                                ref={videoPreviewRef}
                                src={videoUrl}
                                controls
                                preload="metadata"
                                style={{
                                    width: '100%',
                                    maxHeight: 200,
                                    display: 'block',
                                    background: '#000',
                                    borderRadius: '6px',
                                }}
                                onLoadedMetadata={() => {
                                    if (videoPreviewRef.current) {
                                        videoPreviewRef.current.currentTime = 1
                                    }
                                }}
                            />
                            <div style={{
                                position: 'absolute', bottom: 6, left: 6,
                                background: 'rgba(0,0,0,0.7)',
                                backdropFilter: 'blur(8px)',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '2px',
                                display: 'flex', alignItems: 'center', gap: '0.25rem',
                                pointerEvents: 'none',
                            }}>
                                <Check size={8} color="#4a9c4a" />
                                <span style={{
                                    fontFamily: 'var(--font-ui)', fontSize: '0.4rem',
                                    letterSpacing: '0.1em', color: '#4a9c4a',
                                }}>
                                    ATTACHED
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Upload zone */}
                {!videoUrl && !uploading && (
                    <motion.div
                        key="upload-zone"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileRef.current?.click()}
                            style={{
                                marginTop: '0.75rem',
                                padding: '1.5rem 1rem',
                                border: `2px dashed ${dragOver ? '#c4872a' : 'rgba(196,135,42,0.2)'}`,
                                borderRadius: '6px',
                                background: dragOver ? 'rgba(196,135,42,0.06)' : 'rgba(0,0,0,0.15)',
                                cursor: 'pointer',
                                transition: 'all 0.25s',
                                textAlign: 'center',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', gap: '0.6rem',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(196,135,42,0.4)'; e.currentTarget.style.background = 'rgba(196,135,42,0.03)' }}
                            onMouseLeave={e => { if (!dragOver) { e.currentTarget.style.borderColor = 'rgba(196,135,42,0.2)'; e.currentTarget.style.background = 'rgba(0,0,0,0.15)' }}}
                        >
                            <div style={{
                                width: 40, height: 40,
                                borderRadius: '50%',
                                background: 'rgba(196,135,42,0.1)',
                                border: '1px solid rgba(196,135,42,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Upload size={16} color="#c4872a" />
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-ui)', fontSize: '0.55rem',
                                letterSpacing: '0.1em', color: '#c4872a',
                            }}>
                                DROP YOUR VIDEO REVIEW HERE
                            </div>
                            <div style={{
                                fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                                color: 'var(--fog)', lineHeight: 1.4,
                            }}>
                                MP4, WebM, or MOV · Max 10 min · Up to 500MB
                            </div>
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
