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
  RANK_MARKS,
} from '../gatedFeatures';
import { PRIVILEGES, RANKS, privilegesOf } from '../membership';

const ROOT = join(__dirname, '..', '..', '..');

// ── the promises, read from the file the Society page sells from ────────────
// One list feeds every ticket and the ledger, so it is the whole of what we sell.
const soldPromises = (): { rank: string; promise: string }[] =>
  PRIVILEGES.filter((p) => p.rank !== 'cinephile').map((p) => ({ rank: p.rank, promise: p.name }));

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

const rel = (file: string) => file.slice(ROOT.length + 1).replace(/\\/g, '/');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

/**
 * Every `useClearance('<id>')` in the client, by file.
 *
 * The house's own way to rope an act, and so the one a registry row can be
 * checked against by NAME. The old stale-entry check asked only whether a file
 * mentioned a rank at all — so a feed card roping SPEAKING sat under ENTERING
 * for weeks, and passed.
 */
const clearanceCalls = (): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const file of [...collect(join(ROOT, 'src')), ...collect(join(ROOT, 'app'))]) {
    const r = rel(file);
    if (r === 'src/hooks/useClearance.ts') continue;
    const ids = [...stripComments(readFileSync(file, 'utf8')).matchAll(/useClearance\('([^']+)'/g)].map((m) => m[1]);
    if (ids.length) out.set(r, ids);
  }
  return out;
};

const viewerGateFiles = (): string[] => {
  const files = [...collect(join(ROOT, 'src')), ...collect(join(ROOT, 'app'))];
  // Ropes count as gates. Counting only bare tier checks meant every rope moved
  // onto useClearance made this scan see LESS — the tripwire below fell from 10
  // to 8 on the day two gates were done properly.
  const hit = new Set<string>(clearanceCalls().keys());
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
      ...RANK_MARKS.map((m) => m.promise),
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
        /**
         * Every way this app knows how to refuse on rank.
         *
         * `useClearance` and `ClearanceGate` are the NEW way and were missing
         * from this list, so the first file to adopt them read as a file with
         * no gate in it at all — the check reporting a stale entry for a gate
         * that had just been written properly. A hand-written list decides what
         * a check can see, which is the same lesson as the jest mock hand-lists.
         */
        const gates = new RegExp([
          'useClearance', 'ClearanceGate',                 // the house pattern
          'showTierDoor',                                  // the door AFTER the act
          'isArchivistPlusTier', 'isAuteurPlusTier',       // a direct tier check
          'LogClearanceGate', 'deckLabelProps',            // the log's originals
          'dispatch_dossiers',                             // the offline essay path
        ].join('|')).test(text);
        // A stale entry is worse than a missing one: it reads as a considered
        // decision about something that is no longer there.
        expect(`${f.id} -> ${g}: ${gates}`).toBe(`${f.id} -> ${g}: true`);
      }
    }
  });

  describe('a rope is filed under the act it actually guards', () => {
    const calls = clearanceCalls();

    it('every useClearance call names a feature that lists that file', () => {
      /**
       * The direction that catches a new rope nobody registered: a gate that
       * reports to the funnel under a feature whose row does not know it exists.
       */
      const unlisted: string[] = [];
      for (const [file, ids] of calls) {
        for (const id of ids) {
          const f = GATED_FEATURES.find((x) => x.id === id);
          if (!f) unlisted.push(`${file}: useClearance('${id}') has no registry row`);
          else if (!f.gates.includes(file)) unlisted.push(`${file}: ropes '${id}' but '${id}' does not list it`);
        }
      }
      expect(unlisted).toEqual([]);
    });

    it('and a file a feature lists as its rope ropes THAT feature', () => {
      /**
       * The direction that caught this: ActionDeck and the person page were
       * listed under `the-lounge` (entering) while what they do is SHARE into a
       * salon (speaking). A file listed under a feature must, if it ropes
       * anything by name, rope that one. A door file (showTierDoor) reads the
       * server's own sentence and names no feature, so it is exempt.
       */
      const misfiled: string[] = [];
      for (const f of GATED_FEATURES) {
        for (const g of f.gates) {
          const ids = calls.get(g);
          if (!ids) continue;
          const text = readFileSync(join(ROOT, g), 'utf8');
          if (/showTierDoor/.test(text) && !ids.includes(f.id)) continue;
          if (!ids.includes(f.id)) misfiled.push(`${f.id} lists ${g}, which ropes ${ids.join(', ')}`);
        }
      }
      expect(misfiled).toEqual([]);
    });

    it('the scan found ropes to check — not passing on an empty map', () => {
      expect(calls.size).toBeGreaterThanOrEqual(6);
    });
  });

  describe('every act the database refuses has a rope before it or a door after it', () => {
    /**
     * THE GAP THIS EXISTS FOR. tierRefusal.ts read every sentence a trigger can
     * raise, gates:check verified those sentences against production character
     * for character — and nothing called it. A member whose rank had ended
     * tapped send and was told "Failed to send message." over a retry that
     * could never succeed. Every check passed, because every check looked at
     * the map and none asked whether anyone read it.
     *
     * So each refused act must show one of three things:
     *   ROPE    some screen asks useClearance('<id>') before the act
     *   DOOR    a file this feature names reads the refusal (showTierDoor)
     *   THROUGH it is reachable only past another feature's rope — named, roped
     *           itself, and explained at length
     */
    const calls = clearanceCalls();
    const roped = new Set([...calls.values()].flat());
    const doorFiles = new Set(
      [...collect(join(ROOT, 'src')), ...collect(join(ROOT, 'app'))]
        .map(rel)
        .filter((f) => f !== 'src/utils/tierDoor.ts')
        .filter((f) => /showTierDoor\(/.test(stripComments(readFileSync(join(ROOT, f), 'utf8')))),
    );

    it('none is left with nothing between the member and "something went wrong"', () => {
      const bare: string[] = [];
      for (const f of GATED_FEATURES) {
        if (f.enforcement.kind !== 'refuses') continue;
        const rope = roped.has(f.id);
        const door = f.gates.some((g) => doorFiles.has(g));
        const through = f.reachedThrough;
        if (rope || door) continue;
        if (!through) { bare.push(`${f.id}: no rope, no door, and no reachedThrough`); continue; }
        if (!GATED_FEATURES.some((x) => x.id === through.feature)) {
          bare.push(`${f.id}: reachedThrough names '${through.feature}', which is not a feature`);
        } else if (!roped.has(through.feature)) {
          bare.push(`${f.id}: reached through '${through.feature}', which has no rope of its own`);
        }
        if (through.why.length < 120) bare.push(`${f.id}: reachedThrough.why is too thin to be a reason`);
      }
      expect(bare).toEqual([]);
    });

    it('the door is actually wired — the defect, as a count', () => {
      // Zero here is exactly the state that shipped. The lounge (send, retry,
      // react), both Dispatch desks.
      expect(doorFiles.size).toBeGreaterThanOrEqual(3);
      expect([...doorFiles]).toEqual(expect.arrayContaining([
        'src/stores/lounge.ts', 'app/dispatch/compose.tsx', 'src/components/dispatch/ComposeDesks.tsx',
      ]));
    });

    it('and the door itself still reads the sentence table', () => {
      const door = stripComments(readFileSync(join(ROOT, 'src/utils/tierDoor.ts'), 'utf8'));
      expect(door).toMatch(/asTierRefusal\(e\)/);
    });
  });

  it('nothing is sold on the strength of being unenforceable', () => {
    // "Early Access to New Features" sat here: sold, and kept by nothing.
    expect(UNENFORCEABLE_PROMISES).toEqual([]);
  });

  describe('the rank marks are the rank itself', () => {
    it('each mark is sold on the ticket of the rank it marks', () => {
      for (const m of RANK_MARKS) {
        const p = PRIVILEGES.find((x) => x.name === m.promise);
        expect(`${m.promise}: ${p?.rank}`).toBe(`${m.promise}: ${m.rank}`);
      }
    });

    it('and the badge still draws each rank in words a member can read', () => {
      // The mark is a promise the RENDERING keeps. If RankBadge ever stopped
      // drawing a rank, the privilege would be sold with nothing behind it.
      const badge = stripComments(readFileSync(join(ROOT, 'src/components/RankBadge.tsx'), 'utf8'));
      expect(badge).toMatch(/✦ ARCHIVIST/);
      expect(badge).toMatch(/★ AUTEUR/);
      const { rankOf } = require('@/src/components/RankBadge');
      expect(rankOf({ tier: 'archivist' })).toBe('archivist');
      expect(rankOf({ tier: 'auteur' })).toBe('auteur');
      expect(rankOf({ is_founding: true })).toBe('auteur');
    });
  });

  describe('the price list itself', () => {
    it('no name carries a hard line break — the page lays out its own lines', () => {
      // The old names had \n typed into them to fit a card that no longer
      // exists, which is where the ragged, broken lines on the page came from.
      expect(PRIVILEGES.filter((p) => /\n/.test(p.name + p.detail)).map((p) => p.id)).toEqual([]);
    });

    it('every privilege says what it does, in a sentence', () => {
      expect(PRIVILEGES.filter((p) => p.detail.length < 20 || !/[.]$/.test(p.detail)).map((p) => p.id)).toEqual([]);
    });

    it('every id and every name is said once', () => {
      const ids = PRIVILEGES.map((p) => p.id);
      const names = PRIVILEGES.map((p) => p.name);
      expect(ids.length).toBe(new Set(ids).size);
      expect(names.length).toBe(new Set(names).size);
    });

    it('the three ranks are the three the house has, each with something of its own', () => {
      expect(RANKS.map((r) => r.id)).toEqual(['cinephile', 'archivist', 'auteur']);
      for (const r of RANKS) expect(privilegesOf(r.id).length).toBeGreaterThanOrEqual(4);
    });

    it('no rank claims a popularity it has not earned', () => {
      // "MOST POPULAR" was printed over a rank nobody had bought. A
      // recommendation is an opinion and says so; exactly one rank carries it.
      const src = stripComments(readFileSync(join(ROOT, 'src/constants/membership.ts'), 'utf8'))
        + stripComments(readFileSync(join(ROOT, 'app/(modals)/membership.tsx'), 'utf8'));
      expect(src).not.toMatch(/MOST POPULAR|FILLING FAST|popular:/i);
      expect(RANKS.filter((r) => r.recommended).length).toBe(1);
    });
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
    const free = privilegesOf('cinephile');
    const freeTier = { features: free.map((p) => p.name) };

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
      const joined = free.map((p) => `${p.name} ${p.detail}`).join(' ');
      // The three things the old list never mentioned, and the omission of
      // which is what made the app look like a spreadsheet with posters.
      expect(joined).toMatch(/Dispatch/);
      expect(joined).toMatch(/Critique/i);
      expect(joined).toMatch(/vote/i);
    });
  });

  it('the Gilded Frame is gone, and stays gone', () => {
    // The specific lie, pinned by name. If it ever comes back it must come back
    // with something built behind it.
    // Comments blanked FIRST. The note explaining why each name was removed
    // necessarily contains the removed name, so asserting absence against raw
    // source fails on the very comment that records the fix.
    const lists = PRIVILEGES.map((p) => `${p.name} ${p.detail}`).join('\n');
    expect(lists).not.toMatch(/Gilded Frame/);
    expect(lists).not.toMatch(/Poster Glow/);
    expect(lists).not.toMatch(/Gold Foil/);
    expect(lists).not.toMatch(/Early Access/);
  });
});
