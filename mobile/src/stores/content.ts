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



// ── DISPATCH STORE ──
export const useDispatchStore = create<DispatchState>((set) => ({
  dossiers: [],
  loading: false,

  fetchDossiers: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('dispatch_dossiers')
        .select('id, title, excerpt, full_content, author_username, user_id, views, certify_count, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data && data.length > 0) {
        set({
          dossiers: data.map((d: Record<string, unknown>) => ({
            id: d.id,
            title: d.title,
            excerpt: (d.excerpt as string) ?? '',
            fullContent: (d.full_content as string) ?? '',
            author: (d.author_username as string)?.toUpperCase() ?? 'ANONYMOUS',
            authorUsername: (d.author_username as string) ?? '',
            authorId: d.user_id,
            views: (d.views as number) ?? 0,
            certifyCount: (d.certify_count as number) ?? 0,
            date: new Date(d.created_at as string).toLocaleDateString('en-US', {
              month: 'short', day: '2-digit', year: 'numeric',
            }).toUpperCase(),
          })),
        });
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
        author_username: user.username,
        title: dossier.title,
        excerpt: dossier.excerpt ?? '',
        full_content: dossier.fullContent ?? '',
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
        authorUsername: data.author_username ?? user.username,
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

    const dbUpdates: Record<string, unknown> = {};
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
