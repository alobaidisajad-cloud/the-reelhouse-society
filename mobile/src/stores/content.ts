/**
 * ReelHouse Mobile — Content Store
 * Dispatch Dossiers + Programmes
 * Mirrors web stores/content.ts — same Supabase table, same data model
 */
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './auth';
import { registerStoreReset } from './resetAllStores';
import reelToast from '../utils/reelToast';

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
  raw_created_at?: string;
}

interface DBDossierUpdate {
  title?: string;
  excerpt?: string;
  full_content?: string;
}

export interface DispatchState {
  dossiers: Dossier[];
  loading: boolean;
  _loadingMore: boolean;
  fetchDossiers: () => Promise<void>;
  addDossier: (dossier: { title: string; excerpt?: string; fullContent?: string }) => Promise<void>;
  updateDossier: (id: string, updates: { title?: string; excerpt?: string; fullContent?: string }) => Promise<void>;
  deleteDossier: (id: string) => Promise<void>;
  loadMoreDossiers: () => Promise<void>;
  syncDossierStats: (id: string, viewsDelta: number, certifyDelta: number) => void;
}



// ── Supabase row shape for dispatch_dossiers ──
interface DossierRow {
  id: string; title: string; excerpt: string | null; full_content: string | null;
  author_username: string | null; user_id: string; views: number | null;
  certify_count: number | null; created_at: string;
}

// ── DISPATCH STORE ──
// D-01 AUDIT DECISION: Dispatch store is intentionally NOT persisted to MMKV.
// Dossiers are server-canonical editorial content that can be large (full_content
// HTML bodies). Persisting them would risk stale content display and bloat the
// MMKV binary on disk. Fresh fetch on cold start is the correct trade-off here.
export const useDispatchStore = create<DispatchState>((set, get) => ({
  dossiers: [],
  loading: false,
  _loadingMore: false,

  fetchDossiers: async () => {
    if (get().loading) return; // Inflight guard — prevent duplicate fetches
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('dispatch_dossiers')
        .select('id, title, excerpt, full_content, author_username, user_id, views, certify_count, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        set({
          dossiers: data.length > 0 ? (data as DossierRow[]).map((d) => ({
            id: d.id,
            title: d.title,
            excerpt: d.excerpt ?? '',
            fullContent: d.full_content ?? '',
            author: d.author_username?.toUpperCase() ?? 'ANONYMOUS',
            authorUsername: d.author_username ?? '',
            authorId: d.user_id,
            views: d.views ?? 0,
            certifyCount: d.certify_count ?? 0,
            date: new Date(d.created_at).toLocaleDateString('en-US', {
              month: 'short', day: '2-digit', year: 'numeric',
            }).toUpperCase(),
            raw_created_at: d.created_at,
          })) : [],
        });
      }
    } catch (err) {
      if (__DEV__) console.error('[Dispatch] fetchDossiers failed:', err);
    }
    set({ loading: false });
  },

  addDossier: async (dossier) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in to file a dossier');

    const tempId = `temp-${Date.now()}`;
    const newDossier: Dossier = {
      id: tempId,
      title: dossier.title,
      excerpt: dossier.excerpt ?? '',
      fullContent: dossier.fullContent ?? '',
      author: user.username?.toUpperCase() ?? 'ANONYMOUS',
      authorUsername: user.username ?? '',
      authorId: user.id,
      views: 0,
      certifyCount: 0,
      date: new Date().toLocaleDateString('en-US', {
        month: 'short', day: '2-digit', year: 'numeric',
      }).toUpperCase(),
      raw_created_at: new Date().toISOString(),
    };

    // Optimistic Update
    set((state) => ({
      dossiers: [newDossier, ...state.dossiers],
    }));

    try {
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
        .select('id, title, excerpt, full_content, author_username, user_id, views, certify_count, created_at')
        .single();

      if (error || !data) throw error || new Error('Failed to file dossier');

      // Swap temp ID with real ID
      set((state) => ({
        dossiers: state.dossiers.map(d => 
          d.id === tempId ? {
            ...newDossier,
            id: data.id,
            author: data.author_username?.toUpperCase() ?? newDossier.author,
            authorUsername: data.author_username ?? newDossier.authorUsername,
            date: new Date(data.created_at).toLocaleDateString('en-US', {
              month: 'short', day: '2-digit', year: 'numeric',
            }).toUpperCase(),
            raw_created_at: data.created_at,
          } : d
        ),
      }));
    } catch (e) {
      // Rollback
      if (__DEV__) console.warn('[addDossier] Failed:', e);
      set((state) => ({
        dossiers: state.dossiers.filter(d => d.id !== tempId)
      }));
      throw e;
    }
  },

  loadMoreDossiers: async () => {
    const { dossiers, _loadingMore } = get();
    if (_loadingMore || dossiers.length === 0) return;
    const oldest = dossiers[dossiers.length - 1];
    if (!oldest.raw_created_at) return;
    set({ _loadingMore: true });

    try {
      const { data, error } = await supabase
        .from('dispatch_dossiers')
        .select('id, title, excerpt, full_content, author_username, user_id, views, certify_count, created_at')
        .eq('is_published', true)
        .lt('created_at', oldest.raw_created_at)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data && data.length > 0) {
        const moreDossiers = (data as DossierRow[]).map((d) => ({
          id: d.id,
          title: d.title,
          excerpt: d.excerpt ?? '',
          fullContent: d.full_content ?? '',
          author: d.author_username?.toUpperCase() ?? 'ANONYMOUS',
          authorUsername: d.author_username ?? '',
          authorId: d.user_id,
          views: d.views ?? 0,
          certifyCount: d.certify_count ?? 0,
          date: new Date(d.created_at).toLocaleDateString('en-US', {
            month: 'short', day: '2-digit', year: 'numeric',
          }).toUpperCase(),
          raw_created_at: d.created_at,
        }));
        
        set(s => ({ dossiers: [...s.dossiers, ...moreDossiers] }));
      }
    } catch { reelToast.error('Failed to load more dossiers.'); }
    set({ _loadingMore: false });
  },

  syncDossierStats: (id, viewsDelta, certifyDelta) => {
    set(s => ({
      dossiers: s.dossiers.map(d => 
        d.id === id 
          ? { 
              ...d, 
              views: d.views + viewsDelta, 
              certifyCount: Math.max(0, d.certifyCount + certifyDelta) 
            } 
          : d
      )
    }));
  },

  updateDossier: async (id, updates) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in');

    const originalDossier = get().dossiers.find(d => d.id === id);
    if (!originalDossier) return;

    // Optimistic Update
    set((state) => ({
      dossiers: state.dossiers.map((d) =>
        d.id === id ? { ...d, ...updates } : d
      ),
    }));

    try {
      const dbUpdates: DBDossierUpdate = {};
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.excerpt !== undefined) dbUpdates.excerpt = updates.excerpt;
      if (updates.fullContent !== undefined) dbUpdates.full_content = updates.fullContent;

      const { error } = await supabase
        .from('dispatch_dossiers')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (e) {
      // Rollback
      if (__DEV__) console.warn(`[updateDossier] Failed for dossier ${id}:`, e);
      set((state) => ({
        dossiers: state.dossiers.map((d) =>
          d.id === id ? originalDossier : d
        ),
      }));
      throw e;
    }
  },

  deleteDossier: async (id) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in');

    const dossierToRemove = get().dossiers.find(d => d.id === id);
    if (!dossierToRemove) return;

    // Optimistic Update
    set(state => ({
      dossiers: state.dossiers.filter(d => d.id !== id)
    }));

    try {
      const { error } = await supabase
        .from('dispatch_dossiers')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (e: unknown) {
      // Rollback
      if (__DEV__) console.warn(`[deleteDossier] Failed for dossier ${id}:`, e);
      set(state => ({
        dossiers: [dossierToRemove, ...state.dossiers] // Could insert at exact index for perfection, but prepend is safe
      }));
      throw e; // Let the UI handle the error toast
    }
  },
}));

// F-10 FIX: Register cleanup handler for centralized logout
registerStoreReset(() => {
    useDispatchStore.setState({ dossiers: [], loading: false });
});
