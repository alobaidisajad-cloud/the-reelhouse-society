/**
 * A log's counts — and the viewer's own mark — asked for INSIDE a direct query.
 *
 * The feed functions carry these as columns (20260926_01, _03). A direct query
 * gets the same answers from PostgREST's embedded counts, through the two
 * foreign keys that point at `logs` — one request, not one per card:
 *
 *   certify_count  every certification of the log
 *   critique_count every critique on it
 *   certified      the VIEWER's certification of it: 1 or 0. The heart used to
 *                  come from the member's newest 500 certifications only, so an
 *                  older one drew an empty heart (see learnEndorsements).
 *
 * `interactions` holds every kind of mark a log receives (retransmits,
 * reactions), so both embeds of it are narrowed by FILTERS, and because the
 * table is embedded twice each filter names its embed's ALIAS, never the
 * table. Measured against production: unfiltered, five of five logs carrying
 * other marks came back wrong; two aliases each with its own filters, forty of
 * forty right, the viewer's mark and the total counted apart.
 *
 * All of it is read under the viewer's own row security, as the feed functions
 * are. Counts arrive as `[{ count: n }]`; `markCount` and `mineMark`
 * (feed.schema) read that shape.
 */
export const LOG_CERTIFY_SELECT = 'certify_count:interactions!interactions_target_log_id_fkey(count)';
export const LOG_CRITIQUE_SELECT = 'critique_count:log_comments!log_comments_log_id_fkey(count)';
export const LOG_MINE_SELECT = 'certified:interactions!interactions_target_log_id_fkey(count)';

/** The embeds for a list of logs; the viewer's mark only when there is a viewer. */
export function logCountsSelect(viewerId: string | null | undefined): string {
  return [LOG_CERTIFY_SELECT, LOG_CRITIQUE_SELECT, viewerId ? LOG_MINE_SELECT : null].filter(Boolean).join(', ');
}

/** The embeds for one log's page: its certify count and the viewer's mark (critiques are counted by the page). */
export function logCertifySelect(viewerId: string | null | undefined): string {
  return [LOG_CERTIFY_SELECT, viewerId ? LOG_MINE_SELECT : null].filter(Boolean).join(', ');
}

/** Only the one method this needs — a supabase-js builder's own type is too deep to constrain on. */
type Filterable = { eq: (column: string, value: string) => Filterable };

/** The filters the embeds need — ALWAYS applied with the select they belong to. */
export function withLogCountFilters<Q>(query: Q, viewerId: string | null | undefined): Q {
  let q = (query as unknown as Filterable).eq('certify_count.type', 'endorse_log');
  if (viewerId) q = q.eq('certified.type', 'endorse_log').eq('certified.user_id', viewerId);
  return q as unknown as Q;
}
