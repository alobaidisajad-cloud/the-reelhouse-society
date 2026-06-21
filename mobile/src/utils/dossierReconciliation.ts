/**
 * dossierReconciliation.ts — Offline Queue Reconciliation for Dossiers
 * ────────────────────────────────────────────────────────────────────
 * Extracts duplicated queue-parsing and row-mapping logic from content.ts
 * into reusable, testable helpers. Both functions produce results identical
 * to the original inline code they replace.
 */
import { getOfflineQueue, type QueuedMutation } from './offlineQueue';

// ── Supabase row shape for dispatch_dossiers (mirrors content.ts) ──
interface DossierRow {
  id: string; title: string; excerpt: string | null; full_content: string | null;
  author_username: string | null; user_id: string; views: number | null;
  certify_count: number | null; created_at: string;
}

export interface DossierPendingState {
  pendingDeletes: Set<string>;
  pendingUpdates: Map<string, Record<string, unknown>>;
  pendingCreatesMap: Map<string, Record<string, unknown>>;
  pendingCertifies: Map<string, boolean>;
  pendingViews: Map<string, number>;
}

/**
 * Parse the offline queue into a categorised pending-state object.
 * Handles all 5 dossier mutation types: delete_dossier, update_dossier,
 * add_dossier, toggle_dossier_certify, increment_dossier_views.
 */
export function parseDossierPendingState(queue?: QueuedMutation[]): DossierPendingState {
  const offlineQueue = queue ?? getOfflineQueue();
  const pendingDeletes = new Set<string>();
  const pendingUpdates = new Map<string, Record<string, unknown>>();
  const pendingCreatesMap = new Map<string, Record<string, unknown>>();
  const pendingCertifies = new Map<string, boolean>();
  const pendingViews = new Map<string, number>();

  offlineQueue.forEach(m => {
    if (m.type === 'delete_dossier') pendingDeletes.add(m.payload.id as string);
    if (m.type === 'update_dossier') {
      const prev = pendingUpdates.get(m.payload.id as string) || {};
      pendingUpdates.set(m.payload.id as string, { ...prev, ...(m.payload.updates as Record<string, unknown>) });
    }
    if (m.type === 'add_dossier') {
      pendingCreatesMap.set(m.payload._tempId as string, m.payload);
    }
    if (m.type === 'toggle_dossier_certify') {
      pendingCertifies.set(m.payload.dossier_uuid as string, m.payload.desired_state as boolean);
    }
    if (m.type === 'increment_dossier_views') {
      const id = m.payload.dossier_uuid as string;
      pendingViews.set(id, (pendingViews.get(id) || 0) + 1);
    }
  });

  return { pendingDeletes, pendingUpdates, pendingCreatesMap, pendingCertifies, pendingViews };
}

/**
 * Apply pending offline state to a single server-fetched DossierRow.
 * Returns the mapped Dossier object, or null if the row is pending deletion.
 *
 * @param row           - A raw DossierRow from Supabase
 * @param pending       - The parsed pending state from parseDossierPendingState
 * @param serverCertifiedIds - Set of dossier IDs the server says the current user has certified
 */
export function applyPendingToDossierRow(
  row: DossierRow,
  pending: DossierPendingState,
  serverCertifiedIds: Set<string>,
): {
  id: string; title: string; excerpt: string; fullContent: string;
  author: string; authorUsername: string; authorId: string;
  views: number; certifyCount: number; date: string; raw_created_at: string;
} | null {
  if (pending.pendingDeletes.has(row.id)) return null;

  const localUpdate = pending.pendingUpdates.get(row.id);

  let finalCertifyCount = row.certify_count ?? 0;
  if (pending.pendingCertifies.has(row.id)) {
    const desiredState = pending.pendingCertifies.get(row.id)!;
    const serverState = serverCertifiedIds.has(row.id);
    if (desiredState && !serverState) finalCertifyCount += 1;
    else if (!desiredState && serverState) finalCertifyCount = Math.max(0, finalCertifyCount - 1);
  }

  return {
    id: row.id,
    title: (localUpdate?.title ?? row.title) as string,
    excerpt: (localUpdate?.excerpt ?? row.excerpt ?? '') as string,
    fullContent: (localUpdate?.full_content ?? row.full_content ?? '') as string,
    author: row.author_username?.toUpperCase() ?? 'ANONYMOUS',
    authorUsername: row.author_username ?? '',
    authorId: row.user_id,
    views: (row.views ?? 0) + (pending.pendingViews.get(row.id) ?? 0),
    certifyCount: finalCertifyCount,
    date: new Date(row.created_at).toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric',
    }).toUpperCase(),
    raw_created_at: row.created_at,
  };
}

/**
 * Build a Dossier view object from a pending create payload.
 * Eliminates the duplicate cold-start mapping that existed in
 * content.ts's success and error paths.
 */
export function buildDossierFromPendingCreate(
  payload: Record<string, unknown>,
  pending: DossierPendingState,
): {
  id: string; title: string; excerpt: string; fullContent: string;
  author: string; authorUsername: string; authorId: string;
  views: number; certifyCount: number; date: string; raw_created_at: string;
} {
  const id = payload._tempId as string;
  let finalCertifyCount = 0;
  if (pending.pendingCertifies.has(id)) {
    finalCertifyCount = pending.pendingCertifies.get(id) ? 1 : 0;
  }
  return {
    id,
    title: (pending.pendingUpdates.get(id)?.title ?? payload.title) as string,
    excerpt: (pending.pendingUpdates.get(id)?.excerpt ?? payload.excerpt ?? '') as string,
    fullContent: (pending.pendingUpdates.get(id)?.full_content ?? payload.full_content ?? '') as string,
    author: ((payload.author_username || 'ANONYMOUS') as string).toUpperCase(),
    authorUsername: (payload.author_username || '') as string,
    authorId: payload.user_id as string,
    views: (pending.pendingViews.get(id) ?? 0) as number,
    certifyCount: finalCertifyCount,
    date: new Date((payload.created_at || Date.now()) as string | number).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase(),
    raw_created_at: (payload.created_at || new Date().toISOString()) as string,
  };
}
