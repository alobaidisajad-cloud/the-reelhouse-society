/**
 * ReelHouse Mobile — Content Store
 * Dispatch Dossiers + Programmes
 * Mirrors web stores/content.ts — same Supabase table, same data model
 */
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';

// ── Types ──
export interface Dossier {
  id: string;
  title: string;
  excerpt: string;
  fullContent: string;
  author: string;
  authorUsername: string;
  authorId: string;
  views: number;
  certifyCount: number;
  date: string;
}

export interface DispatchState {
  dossiers: Dossier[];
  loading: boolean;
  fetchDossiers: () => Promise<void>;
  addDossier: (dossier: { title: string; excerpt?: string; fullContent?: string }) => Promise<void>;
  updateDossier: (id: string, updates: { title?: string; excerpt?: string; fullContent?: string }) => Promise<void>;
  deleteDossier: (id: string) => Promise<void>;
}

// ── Seed data fallback (shown when table is empty) ──
const SEED_DOSSIERS: Dossier[] = [
  {
    id: 'seed-1',
    title: 'The Death of the Jump Scare',
    excerpt: 'Why modern horror is trading cheap thrills for existential dread, and why audiences are finally craving atmosphere over adrenaline.',
    fullContent: 'There was a time when horror directors believed the jolt was the point. The sudden crash of music, the figure lunging from the dark — a cheap electrical charge designed to make you spill your popcorn. But something shifted. Audiences grew tired of being startled and started craving something worse: the slow creep of dread that follows you home.\n\nFilms like Hereditary, The Lighthouse, and Midsommar did not succeed because they made you jump. They succeeded because they made you feel fundamentally unsafe — in the family home, in broad daylight, in your own mind.',
    author: 'MIDNIGHT_MUSE',
    authorUsername: 'midnight_muse',
    authorId: '',
    views: 0,
    certifyCount: 0,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase(),
  },
  {
    id: 'seed-2',
    title: '35mm in the Desert',
    excerpt: "A dispatch from the Southwest's last true projectionist. The heat is melting the reels, but the show goes on.",
    fullContent: "The projector room smells of acetate and machine oil. Outside, the Sonoran desert bakes at 110 degrees. Inside, Cecil Navarro threads the reel with the practiced ease of a man who has done it 40,000 times.\n\nHe is the last full-time 35mm projectionist in a three-state radius. The cinema he runs, the Velvet Gate, is a converted church that seats 90 people on mismatched pews. On weekends, every pew is full.\n\n'Digital is clean,' Navarro says, not looking up from the projector. 'But clean is not the same as true.'",
    author: 'ARCHIVE_GHOST',
    authorUsername: 'archive_ghost',
    authorId: '',
    views: 0,
    certifyCount: 0,
    date: new Date(Date.now() - 86400000).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase(),
  },
];

// ── DISPATCH STORE ──
export const useDispatchStore = create<DispatchState>((set) => ({
  dossiers: [],
  loading: false,

  fetchDossiers: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('dispatch_dossiers')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data && data.length > 0) {
        set({
          dossiers: data.map((d: any) => ({
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
        });
      } else if (!error && Array.isArray(data) && data.length === 0) {
        // No published dossiers yet — show seed content
        set({ dossiers: SEED_DOSSIERS });
      }
    } catch {}
    set({ loading: false });
  },

  addDossier: async (dossier) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in to file a dossier');

    const { data, error } = await supabase
      .from('dispatch_dossiers')
      .insert([{
        user_id: user.id,
        author_username: (user as any).username,
        title: dossier.title,
        excerpt: dossier.excerpt || '',
        full_content: dossier.fullContent || '',
        is_published: true,
      }])
      .select()
      .single();

    if (error || !data) throw error || new Error('Failed to file dossier');

    set((state) => ({
      dossiers: [{
        id: data.id,
        title: data.title,
        excerpt: data.excerpt,
        fullContent: data.full_content,
        author: data.author_username?.toUpperCase(),
        authorUsername: data.author_username || (user as any).username,
        authorId: data.user_id,
        views: 0,
        certifyCount: 0,
        date: new Date(data.created_at).toLocaleDateString('en-US', {
          month: 'short', day: '2-digit', year: 'numeric',
        }).toUpperCase(),
      }, ...state.dossiers],
    }));
  },

  updateDossier: async (id, updates) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in');

    const dbUpdates: Record<string, any> = {};
    if (updates.title) dbUpdates.title = updates.title;
    if (updates.excerpt) dbUpdates.excerpt = updates.excerpt;
    if (updates.fullContent) dbUpdates.full_content = updates.fullContent;

    const { error } = await supabase
      .from('dispatch_dossiers')
      .update(dbUpdates)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    set((state) => ({
      dossiers: state.dossiers.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
    }));
  },

  deleteDossier: async (id) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in');

    const { error } = await supabase
      .from('dispatch_dossiers')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    set((state) => ({
      dossiers: state.dossiers.filter((d) => d.id !== id),
    }));
  },
}));
