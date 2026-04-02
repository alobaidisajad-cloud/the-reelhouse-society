import { create } from 'zustand'
import { supabase } from '../supabaseClient'
import { useAuthStore } from './auth'
import { Dossier, Programme } from '../types'

export interface DispatchState {
    dossiers: Partial<Dossier>[] & { fullContent?: string, author?: string, date?: string }[]
    loading: boolean
    fetchDossiers: () => Promise<void>
    addDossier: (dossier: Partial<Dossier> & { fullContent?: string }) => Promise<void>
    updateDossier: (id: string, updates: { title?: string; excerpt?: string; fullContent?: string }) => Promise<void>
    deleteDossier: (id: string) => Promise<void>
}

// ── DISPATCH STORE — Auteur dossiers ──
export const useDispatchStore = create<DispatchState>((set) => ({
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
                    authorUsername: d.author_username || '',
                    authorId: d.user_id,
                    views: d.views || 0,
                    certifyCount: d.certify_count || 0,
                    date: new Date(d.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: '2-digit', year: 'numeric',
                    }).toUpperCase(),
                })),
            })
        }
        // Seed data only when table genuinely has no published content yet
        if (!error && Array.isArray(data) && data.length === 0) {
            set({
                dossiers: [
                    {
                        id: 'seed-1',
                        title: 'The Death of the Jump Scare',
                        excerpt: 'Why modern horror is trading cheap thrills for existential dread, and why audiences are finally craving atmosphere over adrenaline.',
                        fullContent: 'There was a time when horror directors believed the jolt was the point. The sudden crash of music, the figure lunging from the dark — a cheap electrical charge designed to make you spill your popcorn. But something shifted. Audiences grew tired of being startled and started craving something worse: the slow creep of dread that follows you home.\n\nFilms like Hereditary, The Lighthouse, and Midsommar did not succeed because they made you jump. They succeeded because they made you feel fundamentally unsafe — in the family home, in broad daylight, in your own mind. The horror had migrated from the screen into the nervous system.\n\nThis is where modern auteur horror lives: in the pause before the sound, in the wide shot that stays too long, in the moment when the character walks toward the thing you are begging them to avoid. The jump scare is dead. Long live the dread.',
                        author: 'MIDNIGHT_MUSE',
                        date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase(),
                    },
                    {
                        id: 'seed-2',
                        title: '35mm in the Desert',
                        excerpt: "A dispatch from the Southwest's last true AUTEUR. The heat is melting the reels, but the show goes on.",
                        fullContent: "The projector room smells of acetate and machine oil. Outside, the Sonoran desert bakes at 110 degrees. Inside, Cecil Navarro threads the reel with the practiced ease of a man who has done it 40,000 times.\n\nHe is the last full-time 35mm AUTEUR in a three-state radius. The cinema he runs, the Velvet Gate, is a converted church that seats 90 people on mismatched pews. On weekends, every pew is full.\n\n'Digital is clean,' Navarro says, not looking up from the projector. 'But clean is not the same as true. There is something in the grain that tells the audience: this was real. Someone held a camera. Light touched something physical.' He clicks the reel into the sprockets. 'You cannot fake that. You can only preserve it.'\n\nThe house lights dim. The beam cuts through the dark like a wound in the air. The audience, many of whom drove two hours, goes quiet. The show goes on.",
                        author: 'ARCHIVE_GHOST',
                        date: new Date(Date.now() - 86400000).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase(),
                    },
                ],
            })
        }
        set({ loading: false })
    },

    addDossier: async (dossier) => {
        const user = useAuthStore.getState().user
        if (!user) throw new Error("Must be logged in to file a dossier")
        const { data, error } = await supabase
            .from('dispatch_dossiers')
            .insert([{
                user_id: user.id, author_username: user.username,
                title: dossier.title, excerpt: dossier.excerpt || '',
                full_content: dossier.fullContent || '', is_published: true,
            }])
            .select().single()
            
        if (error || !data) throw error || new Error("Failed to file dossier")
            
        set((state) => ({
            dossiers: [{
                id: data.id, title: data.title, excerpt: data.excerpt,
                fullContent: data.full_content,
                author: data.author_username?.toUpperCase(),
                authorUsername: data.author_username || user.username,
                authorId: data.user_id,
                views: 0,
                certifyCount: 0,
                date: new Date(data.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: '2-digit', year: 'numeric',
                }).toUpperCase(),
            }, ...state.dossiers],
        }))
    },

    updateDossier: async (id, updates) => {
        const user = useAuthStore.getState().user
        if (!user) throw new Error("Must be logged in")
        const dbUpdates: Record<string, any> = {}
        if (updates.title) dbUpdates.title = updates.title
        if (updates.excerpt) dbUpdates.excerpt = updates.excerpt
        if (updates.fullContent) dbUpdates.full_content = updates.fullContent

        const { error } = await supabase
            .from('dispatch_dossiers')
            .update(dbUpdates)
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) throw error

        set((state) => ({
            dossiers: state.dossiers.map((d: any) =>
                d.id === id ? { ...d, ...updates, author: d.author } : d
            ),
        }))
    },

    deleteDossier: async (id) => {
        const user = useAuthStore.getState().user
        if (!user) throw new Error("Must be logged in")

        const { error } = await supabase
            .from('dispatch_dossiers')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) throw error

        set((state) => ({
            dossiers: state.dossiers.filter((d: any) => d.id !== id),
        }))
    },
}))

export interface ProgrammeState {
    programmes: Programme[]
    loading: boolean
    fetchProgrammes: () => Promise<void>
    addProgramme: (programme: Partial<Programme> & { isPublic?: boolean }) => Promise<void>
    removeProgramme: (id: string) => Promise<void>
}

// ── PROGRAMME STORE — Auteur curated film pairings ──
export const useProgrammeStore = create<ProgrammeState>((set) => ({
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
            .limit(100)
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
        if (!user) throw new Error("Must be logged in to curate programmes")
        const { data, error } = await supabase
            .from('programmes')
            .insert([{
                user_id: user.id, title: programme.title,
                description: programme.description || '',
                films: programme.films || [],
                is_public: programme.isPublic !== false,
            }])
            .select().single()
            
        if (error || !data) throw error || new Error("Failed to save programme")
            
        set((state) => ({
            programmes: [{
                id: data.id, title: data.title, description: data.description,
                films: data.films, isPublic: data.is_public, createdAt: data.created_at,
            }, ...state.programmes],
        }))
    },

    removeProgramme: async (id) => {
        const { error } = await supabase.from('programmes').delete().eq('id', id)
        if (error) throw error
        set((state) => ({ programmes: state.programmes.filter((p) => p.id !== id) }))
    },
}))
