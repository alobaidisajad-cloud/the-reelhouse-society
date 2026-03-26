import { create } from 'zustand'
import { supabase } from '../supabaseClient'
import type { VideoReview, Tip } from '../types'

interface VideoStore {
    // State
    videosByFilm: Record<number, VideoReview[]>
    myVideos: VideoReview[]
    myEarnings: { total: number; tips: Tip[] }
    uploading: boolean
    uploadProgress: number

    // Actions
    fetchVideosByFilm: (filmId: number) => Promise<void>
    fetchMyVideos: (userId: string) => Promise<void>
    fetchMyEarnings: (userId: string) => Promise<void>
    uploadVideo: (data: { userId: string; username: string; avatar?: string; filmId: number; filmTitle: string; filmPoster?: string | null; title: string; file: File }) => Promise<boolean>
    deleteVideo: (videoId: string) => Promise<void>
    sendTip: (data: { fromUserId: string; fromUsername: string; toUserId: string; videoId: string; amount: number; message?: string }) => Promise<boolean>
    incrementViews: (videoId: string) => Promise<void>
}

export const useVideoStore = create<VideoStore>((set, get) => ({
    videosByFilm: {},
    myVideos: [],
    myEarnings: { total: 0, tips: [] },
    uploading: false,
    uploadProgress: 0,

    fetchVideosByFilm: async (filmId) => {
        const { data } = await supabase
            .from('video_reviews')
            .select('*')
            .eq('film_id', filmId)
            .order('created_at', { ascending: false })
        if (data) {
            set(s => ({ videosByFilm: { ...s.videosByFilm, [filmId]: data } }))
        }
    },

    fetchMyVideos: async (userId) => {
        const { data } = await supabase
            .from('video_reviews')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        if (data) set({ myVideos: data })
    },

    fetchMyEarnings: async (userId) => {
        const { data: tips } = await supabase
            .from('tips')
            .select('*')
            .eq('to_user_id', userId)
            .order('created_at', { ascending: false })
        const tipList = tips || []
        const total = tipList.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
        set({ myEarnings: { total, tips: tipList } })
    },

    uploadVideo: async ({ userId, username, avatar, filmId, filmTitle, filmPoster, title, file }) => {
        set({ uploading: true, uploadProgress: 0 })
        try {
            // Generate unique filename
            const ext = file.name.split('.').pop() || 'mp4'
            const fileName = `${userId}/${Date.now()}.${ext}`

            // Upload to Supabase Storage
            set({ uploadProgress: 30 })
            const { error: uploadError } = await supabase.storage
                .from('video-reviews')
                .upload(fileName, file, { contentType: file.type, upsert: false })
            if (uploadError) throw uploadError

            set({ uploadProgress: 70 })

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('video-reviews')
                .getPublicUrl(fileName)

            // Get video duration from the file
            const duration = await new Promise<number>((resolve) => {
                const video = document.createElement('video')
                video.preload = 'metadata'
                video.onloadedmetadata = () => {
                    URL.revokeObjectURL(video.src)
                    resolve(Math.round(video.duration))
                }
                video.onerror = () => resolve(0)
                video.src = URL.createObjectURL(file)
            })

            // Insert record
            const { error: insertError } = await supabase
                .from('video_reviews')
                .insert({
                    user_id: userId,
                    username,
                    avatar: avatar || null,
                    film_id: filmId,
                    film_title: filmTitle,
                    film_poster: filmPoster || null,
                    title,
                    video_url: publicUrl,
                    thumbnail_url: null,
                    duration_seconds: duration,
                    views: 0,
                    tip_total: 0,
                })
            if (insertError) throw insertError

            set({ uploadProgress: 100 })
            // Refresh my videos
            await get().fetchMyVideos(userId)
            return true
        } catch {
            return false
        } finally {
            set({ uploading: false, uploadProgress: 0 })
        }
    },

    deleteVideo: async (videoId) => {
        await supabase.from('video_reviews').delete().eq('id', videoId)
        set(s => ({ myVideos: s.myVideos.filter(v => v.id !== videoId) }))
    },

    sendTip: async ({ toUserId, videoId, amount, message }) => {
        try {
            const { error } = await supabase.rpc('process_secure_tip', {
                p_to_user_id: toUserId,
                p_video_id: videoId,
                p_amount: amount,
                p_message: message || null
            })
            if (error) throw error

            // Update local state (the trigger handles DB side)
            set(state => {
                const nextVideosByFilm = { ...state.videosByFilm }
                for (const fId in nextVideosByFilm) {
                    nextVideosByFilm[fId] = nextVideosByFilm[fId].map(v => 
                        v.id === videoId ? { ...v, tip_total: (v.tip_total || 0) + amount } : v
                    )
                }
                return {
                    videosByFilm: nextVideosByFilm,
                    myVideos: state.myVideos.map(v => v.id === videoId ? { ...v, tip_total: (v.tip_total || 0) + amount } : v)
                }
            })
            return true
        } catch (error) {
            console.error('Failed to send tip:', error)
            throw error // Re-throw to allow calling component to handle
        }
    },

    incrementViews: async (videoId) => {
        const { data: video } = await supabase
            .from('video_reviews')
            .select('views')
            .eq('id', videoId)
            .single()
        if (video) {
            await supabase
                .from('video_reviews')
                .update({ views: (video.views || 0) + 1 })
                .eq('id', videoId)
        }
    },
}))
