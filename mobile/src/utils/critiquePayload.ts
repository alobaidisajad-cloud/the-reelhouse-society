import { sanitizeInput } from '@/src/utils/sanitizeInput';
import type { DossierComment } from '@/src/types';

export type CritiqueRow = DossierComment & { avatar_url?: string | null };

/**
 * Build the row a dossier critique becomes, cleaned.
 *
 * ── WHY THIS IS A UTIL AND NOT TEN LINES INSIDE THE SCREEN ───────────────────
 * finding 104: the OFFLINE path sanitised this field (mutationExecutor.ts:678) and the
 * online one did not, so the protection ran only when a critique was filed without a
 * network. That asymmetry survived because the online call sat inside a submit handler
 * where no test could reach it.
 *
 * Proven, not assumed: after wiring the sanitiser into this and three other call sites,
 * deleting every one of those calls left the whole suite green — 1322 passing. Logic
 * that cannot be reached by a test is logic that can be deleted by accident.
 *
 * Same reasoning as buildLogPayload (useLogFlow.ts:114), which the codebase already
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
