/**
 * ReelHouse Mobile — Content Store
 * Dispatch Dossiers + Programmes
 * Mirrors web stores/content.ts — same Supabase table, same data model
 */
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/sentry';
import { applyPendingToDossierRow, buildDossierFromPendingCreate, parseDossierPendingState } from '../utils/dossierReconciliation';
import { DossierRowSchema, type ValidatedDossierRow } from '../schemas/dossier.schema';
import { sanitizeInput } from '../utils/sanitizeInput';
import { logger } from '../utils/logger';
import { isNetworkError } from '../utils/networkError';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '../utils/offlineQueue';
import reelToast from '../utils/reelToast';
import { withAbortSignal } from '../utils/withAbortSignal';
import { withTimeout } from '../utils/withTimeout';
import { useAuthStore } from './auth';
import { registerStoreReset } from './resetAllStores';

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
  certifiedDossierIds: Set<string>;
  viewedSessionIds: Set<string>;
  loading: boolean;
  _loadingMore: boolean;
  hasMoreDossiers: boolean;
  fetchDossiers: () => Promise<void>;
  addDossier: (dossier: { title: string; excerpt?: string; fullContent?: string }) => Promise<void | { offline: boolean }>;
  updateDossier: (id: string, updates: { title?: string; excerpt?: string; fullContent?: string }) => Promise<void | { offline: boolean }>;
  deleteDossier: (id: string) => Promise<void>;
  loadMoreDossiers: () => Promise<void>;
  /**
   * Fetch one dossier's essay body and keep it on the row.
   *
   * The feed no longer carries bodies, so the reader asks for one when it opens.
   * It must land HERE and not in the reader's own state: the modal renders
   * `globalDossiers.find(...) ?? base`, so a body held in the component would be
   * discarded on the next render and the reader would silently fall back to the
   * 150-character excerpt.
   *
   * Caching it on the row also means re-opening is instant.
   */
  hydrateDossierBody: (id: string) => Promise<void>;
  syncDossierStats: (id: string, viewsDelta: number, certifyDelta: number, isCertifiedByMe?: boolean) => void;
  markDossierViewed: (id: string) => boolean;
  unmarkDossierViewed: (id: string) => void;
}



// ── Supabase row shape for dispatch_dossiers ──
// Canonical shape + runtime validation now come from DossierRowSchema; this is
// its inferred type so existing references keep their name.
type DossierRow = ValidatedDossierRow;

/**
 * Validate raw Supabase rows at the boundary, dropping any that don't match the
 * expected dispatch_dossiers shape (e.g. after a column rename) instead of
 * letting undefined values flow through as blank dispatch cards.
 */
function parseDossierRows(rows: unknown[]): ValidatedDossierRow[] {
  const out: ValidatedDossierRow[] = [];
  for (const r of rows) {
    const parsed = DossierRowSchema.safeParse(r);
    if (parsed.success) out.push(parsed.data);
    else if (__DEV__) console.warn('[content] Dropped malformed dossier row');
  }
  return out;
}

// ── DISPATCH STORE ──
// Dispatch store is intentionally NOT persisted to MMKV.
// Dossiers are server-canonical editorial content that can be large (full_content
// HTML bodies). Persisting them would risk stale content display and bloat the
// MMKV binary on disk. Fresh fetch on cold start is the correct trade-off here.
let inflightFetch: Promise<void> | null = null;
let fetchGeneration = 0;

export const useDispatchStore = create<DispatchState>((set, get) => ({
  dossiers: [],
  certifiedDossierIds: new Set(),
  viewedSessionIds: new Set(),
  loading: false,
  _loadingMore: false,
  hasMoreDossiers: true,

  fetchDossiers: async () => {
    if (inflightFetch || get()._loadingMore) return inflightFetch || Promise.resolve();
    
    const currentGen = ++fetchGeneration;

    inflightFetch = (async () => {
      set({ loading: true });
      try {
        // The feed asks for what the CARD draws — never the essay bodies.
        //
        // This read used to be `select('*')`, which includes `full_content`. The
        // card renders only the excerpt; the body travelled purely to pre-load the
        // reader. Measured: 83% of the payload on one 2,770-character essay, and
        // up to half a megabyte per page of twenty at the sanitiser's fence.
        //
        // A FUNCTION rather than an explicit column list, because `select('*')`
        // was deliberate — dispatch_dossiers has a history of remote column
        // renames, and an explicit client list breaks hard with 42703 (verified).
        // With the app build frozen until launch, a client-side break could not be
        // fixed without a release; the function puts those column names in the one
        // place that CAN be fixed without one.
        //
        // `full_content` is declared nullable with a default in DossierRowSchema,
        // so a row arriving without a body parses cleanly — the reader fetches it
        // on open (see hydrateDossierBody).
        const { data, error } = await withTimeout(
          (signal) => withAbortSignal(
            supabase.rpc('get_dispatch_feed', { p_limit: 20, p_cursor_created_at: null }),
            signal
          ) as any,
          15_000,
          'content.fetchDossiers'
        ) as { data: any; error: any };

        if (error) throw error;
        if (data) {
          let certData: { dossier_id: string; user_id: string }[] = [];
          const user = useAuthStore.getState().user;
          
          if (user && data.length > 0) {
            const fetchedIds = data.map((d: { id: string }) => d.id);
            const { data: cData } = await withTimeout(
              (signal) => withAbortSignal(
                supabase
                  .from('dossier_certifications')
                  .select('dossier_id')
                  .eq('user_id', user.id)
                  .in('dossier_id', fetchedIds),
                signal
              ) as any,
              15_000,
              'content.fetchCertifications'
            ) as { data: any };
              
            if (cData) {
              certData = cData as any;
            }
          }

          if (fetchGeneration !== currentGen) return;

          // QUEUE RECONCILIATION
          const pending = parseDossierPendingState();
          const { pendingDeletes, pendingUpdates, pendingCertifies, pendingViews, pendingCreatesMap } = pending;
          const pendingCreates = new Set<string>(pendingCreatesMap.keys());

          set((state) => {
            const nextCertifiedIds = new Set(state.certifiedDossierIds);
            if (user && data.length > 0) {
              const fetchedIds = data.map((d: DossierRow) => d.id);
              fetchedIds.forEach((id: string) => nextCertifiedIds.delete(id));
              certData.forEach((c: { dossier_id: string; user_id: string }) => nextCertifiedIds.add(c.dossier_id));
            }

            pendingCertifies.forEach((desiredState, dossierId) => {
              if (desiredState) nextCertifiedIds.add(dossierId);
              else nextCertifiedIds.delete(dossierId);
            });

            const serverCertifiedIds = new Set(certData.map((c: { dossier_id: string }) => c.dossier_id));

            return {
              hasMoreDossiers: data.length === 20,
              dossiers: (() => {
                const mapped = parseDossierRows(data)
                  .map(d => applyPendingToDossierRow(d, pending, serverCertifiedIds))
                  .filter((d): d is NonNullable<typeof d> => d !== null);

                const oldestMapped = mapped.length > 0 ? mapped[mapped.length - 1].raw_created_at : undefined;

                const localPending = state.dossiers.filter(d => {
                  return pendingCreates.has(d.id) || 
                    (!mapped.some(m => m.id === d.id) && d.raw_created_at && oldestMapped && d.raw_created_at > oldestMapped && !pendingDeletes.has(d.id));
                });

                const localPendingIds = new Set(localPending.map(d => d.id));
                const coldStartCreates = Array.from(pendingCreatesMap.values())
                  .filter(p => !pendingDeletes.has(p._tempId as string) && !localPendingIds.has(p._tempId as string) && !mapped.some(m => m.id === p._tempId))
                  .map(p => buildDossierFromPendingCreate(p, { pendingDeletes, pendingUpdates, pendingCreatesMap, pendingCertifies, pendingViews })) as any[];

                return [...coldStartCreates, ...localPending, ...mapped].sort((a, b) => 
                  new Date(b.raw_created_at!).getTime() - new Date(a.raw_created_at!).getTime()
                ) as any[];
              })(),
              certifiedDossierIds: nextCertifiedIds,
            };
          });
        }
      } catch (err) {
        if (fetchGeneration !== currentGen) return;
        if (__DEV__) console.error('[Dispatch] fetchDossiers failed:', err);
        // Surface the real Postgres/PostgREST error (code + message) to Sentry so
        // schema/RLS drift on dispatch_dossiers is observable instead of hidden
        // behind the generic "transmission" toast.
        captureError(err, { where: 'content.fetchDossiers' });

        const { pendingDeletes, pendingUpdates, pendingCreatesMap, pendingCertifies, pendingViews } = parseDossierPendingState();

        set(state => {
          const nextCertifiedIds = new Set(state.certifiedDossierIds);
          pendingCertifies.forEach((desiredState, dossierId) => {
            if (desiredState) nextCertifiedIds.add(dossierId);
            else nextCertifiedIds.delete(dossierId);
          });

          const restoredCreates = Array.from(pendingCreatesMap.values())
            .filter(p => !pendingDeletes.has(p._tempId as string))
            .map(p => buildDossierFromPendingCreate(p, { pendingDeletes, pendingUpdates, pendingCreatesMap, pendingCertifies, pendingViews })) as any[];

          const existing = state.dossiers
            .filter(d => !pendingDeletes.has(d.id))
            .map(d => {
              const up = pendingUpdates.get(d.id);
              if (!up) return d;
              return {
                ...d,
                title: up.title ?? d.title,
                excerpt: up.excerpt ?? d.excerpt,
                fullContent: up.full_content ?? d.fullContent
              };
            });

          const existingIds = new Set(existing.map(e => e.id));
          const novelCreates = restoredCreates.filter(r => !existingIds.has(r.id));

          return { 
             dossiers: [...novelCreates, ...existing],
             certifiedDossierIds: nextCertifiedIds
          };
        });

        set({ loading: false });
        inflightFetch = null;
        // Graceful degrade: don't re-throw. The pending/offline dossiers are already
        // reconciled above and the real error is captured to Sentry, so the Dispatch
        // shows a clean (pending-or-empty) state instead of an error toast — the
        // correct look at launch, and safe for a one-shot build.
      }
      if (fetchGeneration === currentGen) {
        set({ loading: false });
        inflightFetch = null;
      }
    })();
    return inflightFetch;
  },

  addDossier: async (dossier) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in to file a dossier');

    // Single sanitization choke point: clean title/excerpt/content once, before
    // the optimistic update, online insert, and offline-queue payload all read it.
    dossier = {
      title: sanitizeInput(dossier.title ?? '', 'dossierTitle'),
      excerpt: sanitizeInput(dossier.excerpt ?? '', 'dossierExcerpt'),
      fullContent: sanitizeInput(dossier.fullContent ?? '', 'dossierContent'),
    };

    const tempId = Crypto.randomUUID();
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
          id: tempId,
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
            author: (data.author_username as string)?.toUpperCase() ?? newDossier.author,
            authorUsername: (data.author_username as string) ?? newDossier.authorUsername,
            date: new Date(data.created_at as string).toLocaleDateString('en-US', {
              month: 'short', day: '2-digit', year: 'numeric',
            }).toUpperCase(),
            raw_created_at: data.created_at as string,
          } : d
        ),
      }));
    } catch (e: unknown) {

      if (isNetworkError(e)) {
        enqueueMutation({
          type: 'add_dossier',
          payload: {
            _tempId: tempId,
            user_id: user.id,
            author_username: user.username,
            title: dossier.title,
            excerpt: dossier.excerpt ?? '',
            full_content: dossier.fullContent ?? '',
            is_published: true,
            created_at: newDossier.raw_created_at,
          }
        });
        flushOfflineQueue();
        reelToast.success('Dossier queued for offline transmission.');
        return { offline: true } as void | { offline: boolean };
      } else {
        // Rollback
        if (__DEV__) console.warn('[addDossier] Failed:', e);
        set((state) => ({
          dossiers: state.dossiers.filter(d => d.id !== tempId)
        }));
        throw e;
      }
    }
  },

  loadMoreDossiers: async () => {
    if (inflightFetch) return; // Wait for any fetchDossiers to finish
    const { dossiers, _loadingMore, hasMoreDossiers } = get();
    if (_loadingMore || !hasMoreDossiers || dossiers.length === 0) return;
    
    // Derive the oldest cursor from remote items only, skipping offline-queued creates
    const offlineQueue = getOfflineQueue();
    const offlineCreateIds = new Set(offlineQueue.filter(m => m.type === 'add_dossier').map(m => (m.payload as { _tempId: string })._tempId));
    const remoteDossiers = dossiers.filter(d => !offlineCreateIds.has(d.id));
    
    if (remoteDossiers.length === 0) return;
    const oldest = remoteDossiers[remoteDossiers.length - 1];
    if (!oldest.raw_created_at) return;
    
    set({ _loadingMore: true });

    try {
      // Same function as the first page — see fetchDossiers for why it is an RPC.
      const { data, error } = await supabase.rpc('get_dispatch_feed', {
        p_limit: 20,
        p_cursor_created_at: oldest.raw_created_at,
      });

      if (!error && data) {
        let certData: { dossier_id: string }[] = [];
        const user = useAuthStore.getState().user;

        if (user && data.length > 0) {
          const fetchedIds = data.map((d: { id: string }) => d.id);
          const { data: cData } = await supabase
            .from('dossier_certifications')
            .select('dossier_id')
            .eq('user_id', user.id)
            .in('dossier_id', fetchedIds);
            
          if (cData) {
            certData = cData as { dossier_id: string }[];
          }
        }

        // QUEUE RECONCILIATION
        const pending = parseDossierPendingState();
        const { pendingCertifies } = pending;

        set((state) => {
          const nextCertifiedIds = new Set(state.certifiedDossierIds);
          if (user && data.length > 0) {
            const fetchedIds = data.map((d: { id: string }) => d.id);
            fetchedIds.forEach((id: string) => nextCertifiedIds.delete(id));
            certData.forEach((c: { dossier_id: string }) => nextCertifiedIds.add(c.dossier_id));
          }

          pendingCertifies.forEach((desiredState, dossierId) => {
            if (desiredState) nextCertifiedIds.add(dossierId);
            else nextCertifiedIds.delete(dossierId);
          });

          const serverCertifiedIds = new Set(certData.map((c: { dossier_id: string }) => c.dossier_id));

          const moreDossiers = parseDossierRows(data)
            .map(d => applyPendingToDossierRow(d, pending, serverCertifiedIds))
            .filter((d): d is NonNullable<typeof d> => d !== null);
          
          const existingIds = new Set(state.dossiers.map(d => d.id));
          const uniqueMoreDossiers = moreDossiers.filter(d => !existingIds.has(d.id));

          return {
            hasMoreDossiers: data.length === 20,
            dossiers: [...state.dossiers, ...uniqueMoreDossiers],
            certifiedDossierIds: nextCertifiedIds,
          };
        });
      }
    } catch { reelToast.error('Failed to load more dossiers.'); }
    set({ _loadingMore: false });
  },

  hydrateDossierBody: async (id) => {
    // Already here (just written by this member, or read before) — nothing to do.
    const existing = get().dossiers.find(d => d.id === id);
    if (existing?.fullContent) return;

    const { data, error } = await supabase
      .from('dispatch_dossiers')
      .select('id, full_content')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      // The reader still shows the excerpt; only the body is missing. Never silent.
      logger.warn('[content.hydrateDossierBody] failed:', error.message);
      return;
    }
    if (!data?.full_content) return;

    set((state) => ({
      dossiers: state.dossiers.map(d =>
        d.id === id ? { ...d, fullContent: data.full_content as string } : d
      ),
    }));
  },

  unmarkDossierViewed: (id) => {
    set((s) => {
      const nextViewed = new Set(s.viewedSessionIds);
      nextViewed.delete(id);
      return { viewedSessionIds: nextViewed };
    });
  },

  markDossierViewed: (id) => {
    const { viewedSessionIds } = get();
    if (viewedSessionIds.has(id)) return false;
    
    const nextViewed = new Set(viewedSessionIds);
    nextViewed.add(id);
    set({ viewedSessionIds: nextViewed });
    return true;
  },

  syncDossierStats: (id, viewsDelta, certifyDelta, isCertifiedByMe) => {
    set(s => {
      const nextCertified = new Set(s.certifiedDossierIds);
      if (isCertifiedByMe === true) nextCertified.add(id);
      else if (isCertifiedByMe === false) nextCertified.delete(id);

      return {
        dossiers: s.dossiers.map(d => 
          d.id === id 
            ? { 
                ...d, 
                views: Math.max(0, d.views + viewsDelta), 
                certifyCount: Math.max(0, d.certifyCount + certifyDelta) 
              } 
            : d
        ),
        certifiedDossierIds: nextCertified,
      };
    });
  },

  updateDossier: async (id, updates) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in');

    // Sanitize edited fields once (parity with addDossier) so the optimistic
    // update, online write, and offline-queue payload share clean values.
    updates = {
      ...updates,
      ...(updates.title !== undefined && { title: sanitizeInput(updates.title, 'dossierTitle') }),
      ...(updates.excerpt !== undefined && { excerpt: sanitizeInput(updates.excerpt, 'dossierExcerpt') }),
      ...(updates.fullContent !== undefined && { fullContent: sanitizeInput(updates.fullContent, 'dossierContent') }),
    };

    const originalDossier = get().dossiers.find(d => d.id === id);

    // Optimistic Update
    if (originalDossier) {
      set((state) => ({
        dossiers: state.dossiers.map((d) =>
          d.id === id ? { ...d, ...updates } : d
        ),
      }));
    }

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
    } catch (e: unknown) {
      if (isNetworkError(e)) {
        enqueueMutation({
          type: 'update_dossier',
          payload: { id, user_id: user.id, updates: {
            ...(updates.title !== undefined && { title: updates.title }),
            ...(updates.excerpt !== undefined && { excerpt: updates.excerpt }),
            ...(updates.fullContent !== undefined && { full_content: updates.fullContent }),
          }}
        });
        flushOfflineQueue();
        reelToast.success('Edits queued offline.');
        return { offline: true } as void | { offline: boolean };
      } else {
        // Rollback
        if (__DEV__) console.warn(`[updateDossier] Failed for dossier ${id}:`, e);
        if (originalDossier) {
          set((state) => ({
            dossiers: state.dossiers.map((d) =>
              d.id === id ? { 
                ...d, 
                title: originalDossier.title, 
                excerpt: originalDossier.excerpt, 
                fullContent: originalDossier.fullContent 
              } : d
            ),
          }));
        }
        throw e;
      }
    }
  },

  deleteDossier: async (id) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Must be logged in');

    const dossierToRemove = get().dossiers.find(d => d.id === id);

    // Optimistic Update
    if (dossierToRemove) {
      set(state => ({
        dossiers: state.dossiers.filter(d => d.id !== id)
      }));
    }

    try {
      const { error } = await supabase
        .from('dispatch_dossiers')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (e: unknown) {
      if (isNetworkError(e)) {
        enqueueMutation({
          type: 'delete_dossier',
          payload: { id, user_id: user.id }
        });
        flushOfflineQueue();
        reelToast.success('Deletion queued offline.');
      } else {
        // Rollback
        if (__DEV__) console.warn(`[deleteDossier] Failed for dossier ${id}:`, e);
        if (dossierToRemove) {
          set(state => {
            const newDossiers = [...state.dossiers, dossierToRemove];
            return {
              dossiers: newDossiers.sort((a, b) => {
                const timeA = a.raw_created_at ? new Date(a.raw_created_at).getTime() : 0;
                const timeB = b.raw_created_at ? new Date(b.raw_created_at).getTime() : 0;
                return timeB - timeA;
              })
            };
          });
        }
        throw e; // Let the UI handle the error toast
      }
    }
  },
}));

// Register cleanup handler for centralized logout
registerStoreReset(() => {
    fetchGeneration++;
    inflightFetch = null;
    useDispatchStore.setState({ dossiers: [], loading: true, hasMoreDossiers: true, certifiedDossierIds: new Set(), viewedSessionIds: new Set() });
});

// Keeps the dispatch feed in sync with auth state 
// regardless of React component lifecycles, using a microtask to avoid synchronous logout race conditions.
useAuthStore.subscribe((state, prevState) => {
  if (state.isAuthenticated !== prevState.isAuthenticated) {
    Promise.resolve().then(() => {
      useDispatchStore.getState().fetchDossiers().catch(() => {});
    });
  }
});
