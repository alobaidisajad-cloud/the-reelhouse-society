/**
 * prose-handlers.guard.test.ts — the enumeration, made permanent
 * ──────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Batch 14 was closed three separate times. Each time the fix was correct and each
 * time it was incomplete, because it covered the handlers being looked at rather than
 * the whole class:
 *
 *   round 1 — lists sanitised at the source; the OFFLINE handler was not
 *   round 2 — lists' offline gate fixed; add_log, update_log and submit_report had
 *             the identical gap and were not checked
 *   round 3 — those fixed; add_dossier and update_dossier had it too, and that is the
 *             markdown the whole batch's link guard and render cap exist to protect
 *
 * The defect was never in any one fix. It was in stopping before enumerating.
 *
 * So this test does the enumeration mechanically, every run: it reads
 * mutationExecutor.ts, finds every handler, and fails if one writes member prose
 * without sanitising it. A new handler added in batch 15 or batch 30 cannot quietly
 * reintroduce the gap — the suite says so before review does.
 *
 * ── WHY A SOURCE-READING TEST, WHICH IS NORMALLY A SMELL ─────────────────────
 * Because the property being asserted is "no member-authored string reaches the
 * database uncleaned FROM ANYWHERE IN THIS FILE", and that is a statement about the
 * set of handlers, not about any one of them. A behavioural test per handler proves
 * the handlers that were thought of. This proves the ones that were not — which is
 * precisely the failure it was written for.
 *
 * The per-handler behavioural tests in sanitisationCallSites.test.ts remain the real
 * proof that each fix WORKS. This one proves none is MISSING.
 */
import * as fs from 'fs';
import * as path from 'path';

const SOURCE = path.join(__dirname, '..', 'mutationExecutor.ts');

/** Columns that hold text a member typed. */
const PROSE_FIELDS = [
  'review', 'private_notes', 'body', 'content', 'title', 'description',
  'excerpt', 'full_content', 'details', 'bio',
];

/**
 * Handlers that mention a prose-looking field but do NOT carry member text.
 * Each needs a REASON, so clearing one is a decision someone made rather than a
 * name added to silence a failure.
 */
const CLEARED: Record<string, string> = {
  add_film_to_list:       'film_title comes from TMDB, not the member',
  remove_film_from_list:  'film_title comes from TMDB, not the member',
  add_list_items:         'film_title comes from TMDB, not the member',
  restore_list_items:     'film_title comes from TMDB, not the member',
  sync_entitlement:       'writes a subscription tier only',
  mark_watched:           'delegates to insertLog, which cleans',
};

// cleanFiling is the Dispatch's member-prose gate — the same role as cleanProse
// and cleanDossier, over dispatch_posts. Added here rather than exempting
// add_filing and update_filing in CLEARED, because they DO carry member text and
// an exemption would say the opposite.
const SANITISERS = /sanitizeInput|cleanProse|cleanDossier|cleanFiling/;

function handlerBodies(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /^ {4}(\w+): (?:async|insertLog)/gm;
  for (const m of src.matchAll(re)) {
    const start = m.index ?? 0;
    // A handler ends at the next top-level `},` in the registry.
    const end = src.indexOf('\n    },', start);
    out.push({ name: m[1], body: src.slice(start, end > 0 ? end : start + 3000) });
  }
  return out;
}

describe('every offline handler that writes member prose sanitises it', () => {
  const src = fs.readFileSync(SOURCE, 'utf8');
  const handlers = handlerBodies(src);

  it('finds the registry (guards against this test silently matching nothing)', () => {
    // A parser that matches zero handlers would pass every assertion below while
    // proving nothing — the exact false-green this file exists to prevent.
    expect(handlers.length).toBeGreaterThan(15);
    expect(handlers.map(h => h.name)).toEqual(expect.arrayContaining(['add_log', 'create_list', 'add_dossier']));
  });

  it('leaves no member-prose handler uncleaned', () => {
    const offenders = handlers
      .filter(h => new RegExp(`\\b(${PROSE_FIELDS.join('|')})\\b`).test(h.body))
      .filter(h => !SANITISERS.test(h.body))
      .filter(h => !(h.name in CLEARED))
      .map(h => h.name);

    // If this fails, the handler either needs sanitizeInput/cleanProse/cleanDossier,
    // or an entry in CLEARED with a reason it does not carry member text.
    expect(offenders).toEqual([]);
  });

  it('every CLEARED entry still exists — no stale exemptions', () => {
    // An exemption for a deleted handler is a hole waiting for a name collision.
    const names = new Set(handlers.map(h => h.name));
    const stale = Object.keys(CLEARED).filter(n => !names.has(n));
    expect(stale).toEqual([]);
  });
});
