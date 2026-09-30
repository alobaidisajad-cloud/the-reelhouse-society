import { sanitizeInput } from '@/src/utils/sanitizeInput';
import type { DossierComment } from '@/src/types';

export type CritiqueRow = DossierComment & { avatar_url?: string | null };

/**
 * Build the row a dossier critique becomes, cleaned.
 *
 * ── WHY THIS IS A UTIL AND NOT TEN LINES INSIDE THE SCREEN ───────────────────
 * The OFFLINE replay (mutationExecutor's add_dossier_comment) sanitises this field; the
 * online path must too, and one builder for both is how they stay one. Inside a submit
 * handler no test could reach it, and the online call went unsanitised there.
 *
 * Proven, not assumed: after wiring the sanitiser into this and three other call sites,
 * deleting every one of those calls left the whole suite green — 1322 passing. Logic
 * that cannot be reached by a test is logic that can be deleted by accident.
 *
 * Same reasoning as useLogFlow's buildLogPayload, which the codebase already
 * extracted "so the rules are directly testable without rendering".
 *
 * Returns null when the critique is empty once cleaned — a body of nothing but
 * invisible characters is not a comment, and posting it would create a blank row that
 * looks like a rendering bug.
 */
export function buildCritiquePayload(
  raw: string,
  ctx: { id: string; tempId: string; userId: string; username: string; avatarUrl?: string | null },
): CritiqueRow | null {
  const body = sanitizeInput(raw.trim(), 'dossierComment');
  if (!body) return null;
  return {
    id: ctx.tempId,
    dossier_id: ctx.id,
    user_id: ctx.userId,
    username: ctx.username,
    body,
    created_at: new Date().toISOString(),
    avatar_url: ctx.avatarUrl ?? null,
  } as unknown as CritiqueRow;
}
