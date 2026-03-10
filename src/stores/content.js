import { create } from 'zustand'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'

// ── DISPATCH STORE — Auteur dossiers ──
export const useDispatchStore = create((set, get) => ({
    dossiers: [],
    loading: false,

    fetchDossiers: async () => {
        set({ loading: true })
        const { data, error } = await supabase
            .from('dispatch_dossiers')
            .select('*')
            .eq('is_published', true)
            .order('created_at', { ascending: false })
            .limit(20)
        if (!error && data) {
            set({
                dossiers: data.map((d) => ({
                    id: d.id,
                    title: d.title,
                    excerpt: d.excerpt || '',
                    fullContent: d.full_content || '',
                    author: d.author_username?.toUpperCase() || 'ANONYMOUS',
                    date: new Date(d.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: '2-digit', year: 'numeric',
                    }).toUpperCase(),
                })),
            })
        }
        // Seed data when table is empty or errored
        if (error || !data?.length) {
            set({
                dossiers: [
                    { id: 'seed-1', title: 'The Death of the Jump Scare', excerpt: 'Why modern horror is trading cheap thrills for existential dread, and why audiences are finally craving atmosphere over adrenaline.', fullContent: '', author: 'MIDNIGHT_MUSE', date: 'MAR 07, 2026' },
                    { id: 'seed-2', title: '35mm in the Desert', excerpt: "A dispatch from the Southwest's last true projectionist. The heat is melting the reels, but the show goes on.", fullContent: '', author: 'ARCHIVE_GHOST', date: 'MAR 06, 2026' },
                ],
            })
        }
        set({ loading: false })
    },

    addDossier: async (dossier) => {
        const user = useAuthStore.getState().user
        if (!user) return
        const { data, error } = await supabase
            .from('dispatch_dossiers')
            .insert([{
                user_id: user.id, author_username: user.username,
                title: dossier.title, excerpt: dossier.excerpt || '',
                full_content: dossier.fullContent || '', is_published: true,
            }])
            .select().single()
        if (!error && data) {
            set((state) => ({
                dossiers: [{
                    id: data.id, title: data.title, excerpt: data.excerpt,
                    fullContent: data.full_content,
                    author: data.author_username?.toUpperCase(),
                    date: new Date(data.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: '2-digit', year: 'numeric',
                    }).toUpperCase(),
                }, ...state.dossiers],
            }))
        }
    },
}))

// ── PROGRAMME STORE — Auteur curated film pairings ──
export const useProgrammeStore = create((set) => ({
    programmes: [],
    loading: false,

    fetchProgrammes: async () => {
        const user = useAuthStore.getState().user
        if (!user) return
        set({ loading: true })
        const { data, error } = await supabase
            .from('programmes')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        if (!error && data) {
            set({
                programmes: data.map((p) => ({
                    id: p.id, title: p.title, description: p.description,
                    films: p.films || [], isPublic: p.is_public, createdAt: p.created_at,
                })),
            })
        }
        set({ loading: false })
    },

    addProgramme: async (programme) => {
        const user = useAuthStore.getState().user
        if (!user) return
        const { data, error } = await supabase
            .from('programmes')
            .insert([{
                user_id: user.id, title: programme.title,
                description: programme.description || '',
                films: programme.films || [],
                is_public: programme.isPublic !== false,
            }])
            .select().single()
        if (!error && data) {
            set((state) => ({
                programmes: [{
                    id: data.id, title: data.title, description: data.description,
                    films: data.films, isPublic: data.is_public, createdAt: data.created_at,
                }, ...state.programmes],
            }))
        }
    },

    removeProgramme: async (id) => {
        const { error } = await supabase.from('programmes').delete().eq('id', id)
        if (!error) {
            set((state) => ({ programmes: state.programmes.filter((p) => p.id !== id) }))
        }
    },
}))
