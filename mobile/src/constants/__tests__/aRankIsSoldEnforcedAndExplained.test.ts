/**
 * aRankIsSoldEnforcedAndExplained.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * We charged members for a feature that did not exist.
 *
 * "The Gilded Frame (Exclusive Animated Gold Borders)" sat in the Archivist list
 * on the Society page. It appeared in exactly one place in the entire codebase —
 * that list. No component, no style, no trigger, nothing. Anyone who paid
 * £19.99 a year paid partly for it. Alongside it, "Poster Glow Profile
 * Aesthetics" named nothing a member could find: the feature was real but
 * called something else, and "poster glow" is an ungated effect on the film page
 * that everybody already gets.
 *
 * Neither was caught by anything, because the three halves of a rank live in
 * three files that had never been compared:
 *
 *   the PROMISE      src/constants/membership.ts
 *   the ENFORCEMENT  a database trigger
 *   the DOOR         a client gate
 *
 * This compares them. `gatedFeatures.ts` is the map between the three, and this
 * test fails when the map and the territory disagree.
 *
 * ── WHAT THIS CAN AND CANNOT SEE ────────────────────────────────────────────
 * It reads the promise and the door from source, which it can do exactly. It
 * reads the enforcement from `gatedFeatures.ts`, which is a WRITTEN CLAIM about
 * the database — so `npm run gates:check` exists to compare that claim against
 * production. A test that hit the network would be a test that fails on a
 * plane; a claim nobody ever checks against the real thing is how the repo and
 * the deployed database drifted apart in the first place.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import {
  GATED_FEATURES,
  UNENFORCEABLE_PROMISES,
  NOT_A_GATE,
  RANK_WEIGHT,
  FREE_PROMISES,
  MUST_STAY_FREE,
} from '../gatedFeatures';
import { TIERS } from '../membership';

const ROOT = join(__dirname, '..', '..', '..');

// ── the promises, read from the file the Society page sells from ────────────
const soldPromises = (): { rank: string; promise: string }[] => {
  const out: { rank: string; promise: string }[] = [];
  for (const t of TIERS) {
    if (t.id === 'cinephile') continue; // the free tier promises nothing gated
    if (t.featuredFeature) out.push({ rank: t.id, promise: t.featuredFeature.title });
    for (const f of t.features) out.push({ rank: t.id, promise: f });
  }
  return out;
};

// ── the doors, read from the client ─────────────────────────────────────────
const GATE_FN = /\b(isArchivistPlusTier|isAuteurPlusTier)\s*\(([^)]*)\)/g;
/** The argument names that mean "the person holding the phone". */
const VIEWER = /\buser\b|\bme\b|useAuthStore|s\.user/i;
/** …and the ones that mean somebody else, which win when both match. */
const OTHER = /targetUser|item\.|review\.|act\.|author\.|profile\?\.|stack\.|entry\.|log\.|userRole|\brole\b|input|\btier\b/;

const collect = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules', '__tests__', '.expo'].includes(e.name)) collect(full, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

const viewerGateFiles = (): string[] => {
  const files = [...collect(join(ROOT, 'src')), ...collect(join(ROOT, 'app'))];
  const hit = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!/isArchivistPlusTier|isAuteurPlusTier/.test(text)) continue;
    GATE_FN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GATE_FN.exec(text))) {
      const arg = m[2];
      if (!OTHER.test(arg) && VIEWER.test(arg)) {
        hit.add(file.slice(ROOT.length + 1).replace(/\\/g, '/'));
      }
    }
  }
  return [...hit];
};

describe('a rank is sold, enforced, and explained', () => {
  const promises = soldPromises();

  it('every promise on the Society page is backed by something real', () => {
    const backed = new Set([
      ...GATED_FEATURES.map((f) => f.promise),
      ...UNENFORCEABLE_PROMISES,
    ]);
    // Named, not counted. "1 unbacked promise" tells nobody which one we are
    // charging for, and that is the whole failure this test exists to catch.
    const unbacked = promises.filter((p) => !backed.has(p.promise));
    expect(unbacked.map((p) => `${p.rank}: ${JSON.stringify(p.promise)}`)).toEqual([]);
  });

  it('every feature we claim to gate is actually on the Society page', () => {
    const sold = new Set(promises.map((p) => p.promise));
    const phantom = GATED_FEATURES.filter((f) => !sold.has(f.promise));
    // The other direction: a feature withheld from members that we never sold
    // them. They cannot buy their way out of something nobody offered.
    expect(phantom.map((f) => `${f.id} -> ${JSON.stringify(f.promise)}`)).toEqual([]);
  });

  it('a feature is sold at the rank that actually withholds it', () => {
    const wrong = GATED_FEATURES.filter((f) => {
      const p = promises.find((x) => x.promise === f.promise);
      return p && p.rank !== f.rank;
    });
    expect(wrong.map((f) => `${f.id}: sold as ${promises.find((x) => x.promise === f.promise)?.rank}, gated at ${f.rank}`))
      .toEqual([]);
  });

  it('every client gate belongs to a feature, or is declared not to be a gate', () => {
    const claimed = new Set([
      ...GATED_FEATURES.flatMap((f) => f.gates),
      ...NOT_A_GATE.map((n) => n.file),
    ]);
    const orphans = viewerGateFiles().filter((f) => !claimed.has(f));
    // A gate nobody claims is a locked door with no sign on it.
    expect(orphans).toEqual([]);
  });

  it('every gate this table names still exists in the file it names', () => {
    for (const f of GATED_FEATURES) {
      for (const g of f.gates) {
        const text = readFileSync(join(ROOT, g), 'utf8');
        const gates = /isArchivistPlusTier|isAuteurPlusTier|deckLabelProps|LogClearanceGate|dispatch_dossiers/.test(text);
        // A stale entry is worse than a missing one: it reads as a considered
        // decision about something that is no longer there.
        expect(`${f.id} -> ${g}: ${gates}`).toBe(`${f.id} -> ${g}: true`);
      }
    }
  });

  it('a client-only gate has to say why the server does not need to care', () => {
    for (const f of GATED_FEATURES) {
      if (f.enforcement.kind !== 'client-only') continue;
      // The rule: server-enforce what others consume or what costs us; client
      // -enforce pure self-cosmetics. An empty reason means nobody applied it.
      expect(`${f.id}: ${f.enforcement.why.length > 60}`).toBe(`${f.id}: true`);
    }
  });

  it('the ranks match the weights the database uses', () => {
    // profile_tier_weight: archivist 1, auteur 2. If these ever diverge, every
    // has_tier_at_least() call in the database means something else.
    expect(RANK_WEIGHT).toEqual({ archivist: 1, auteur: 2 });
  });

  it('the scans can SEE things — none of this is passing on an empty read', () => {
    expect(promises.length).toBeGreaterThanOrEqual(8);
    expect(viewerGateFiles().length).toBeGreaterThanOrEqual(10);
    expect(GATED_FEATURES.length).toBeGreaterThanOrEqual(9);
  });

  // ── the other direction ───────────────────────────────────────────────────
  describe('what we promise is free, stays free', () => {
    const freeTier = TIERS.find((t) => t.id === 'cinephile');

    it('every line on the Cinephile list is accounted for', () => {
      const claimed = new Set(FREE_PROMISES.map((f) => f.promise));
      const unaccounted = (freeTier?.features ?? []).filter((f) => !claimed.has(f));
      // A free promise nobody mapped is a promise nobody is checking.
      expect(unaccounted.map((f) => JSON.stringify(f))).toEqual([]);
    });

    it('and every mapping still corresponds to a line we actually show', () => {
      const shown = new Set(freeTier?.features ?? []);
      const stale = FREE_PROMISES.filter((f) => !shown.has(f.promise));
      expect(stale.map((f) => JSON.stringify(f.promise))).toEqual([]);
    });

    it('no table a free promise rests on is claimed as a paid feature', () => {
      // The mistake this catches: gating something is one line of SQL, and
      // nobody re-reads the Cinephile list afterwards. A member who finds a
      // locked door where we promised an open one has been lied to just as
      // surely as one who paid for something that does not exist.
      const paidTables = new Set(
        GATED_FEATURES
          .map((f) => f.enforcement)
          .filter((e): e is Extract<typeof e, { table: string }> => 'table' in e)
          .map((e) => e.table),
      );
      const betrayed = MUST_STAY_FREE.filter((t) => paidTables.has(t));
      expect(betrayed).toEqual([]);
    });

    it('the free list is not empty and says more than "basic profile"', () => {
      expect((freeTier?.features ?? []).length).toBeGreaterThanOrEqual(4);
      const joined = (freeTier?.features ?? []).join(' ');
      // The three things the old list never mentioned, and the omission of
      // which is what made the app look like a spreadsheet with posters.
      expect(joined).toMatch(/Dispatch/);
      expect(joined).toMatch(/Critique/);
      expect(joined).toMatch(/Vote/);
    });
  });

  it('the Gilded Frame is gone, and stays gone', () => {
    // The specific lie, pinned by name. If it ever comes back it must come back
    // with something built behind it.
    // Comments blanked FIRST. The note explaining why each name was removed
    // necessarily contains the removed name, so asserting absence against raw
    // source fails on the very comment that records the fix.
    const raw = readFileSync(join(ROOT, 'src/constants/membership.ts'), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    const inFeatureList = /features: \[[\s\S]*?\]/g;
    const lists = src.match(inFeatureList)?.join('\n') ?? '';
    expect(lists).not.toMatch(/Gilded Frame/);
    expect(lists).not.toMatch(/Poster Glow/);
  });
});
