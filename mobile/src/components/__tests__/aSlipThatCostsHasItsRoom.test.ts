/**
 * A slip that costs has its room (DECISIONS 4, P4.34).
 *
 * A control that destroys, commits or spends, or is the way out, carries a `touch` weight on
 * PressableScale, and the weight grows its own box to 48: the box a finger, VoiceOver and
 * TalkBack all read (a halo reaches none of the three). The size sweep holds every weighted
 * control to 48 on every drawn screen; this sweep keeps the weights on the controls that need them:
 *
 *   - a control whose label, as written, begins with a word of that kind (Delete, File, Close…)
 *     carries a weight, unless it is named below with why;
 *   - every weighted control is in mockups/touch-weighted.txt and every line there is still one,
 *     so a control whose label matches no word (the brass ＋, a label built in code) cannot lose
 *     its weight unseen;
 *   - the button that starts a purchase carries `commit`.
 */
type Site = { file: string; line: number; label: string; weight: string };
const { lineOf, listed, sites, WORDS } = require('../../../mockups/tools/touch-weights.cjs') as {
  lineOf: (s: Site) => string; listed: () => string[]; sites: () => Site[]; WORDS: RegExp;
};

/** Controls whose label begins with one of the words, though a slip on them costs nothing. */
const NOT_A_SLIP: Record<string, string> = {
  'app/dispatch/compose.tsx · Block quote': 'a formatting button: it sets a quote mark in the essay, and the next press takes it out',
  'src/features/settings/SettingsScreen.tsx · Send a test crash': 'drawn to the house’s administrators only, behind a confirmation',
};

const all = sites();

describe('a control a slip on costs something carries its weight', () => {
  it('reads the app’s controls, weighted and not', () => {
    expect(all.filter((s) => s.weight).length).toBeGreaterThan(100);
    expect(all.filter((s) => !s.weight).length).toBeGreaterThan(200);
  });

  it('every control named for such a step has one', () => {
    const bare = all.filter((s) => !s.weight && WORDS.test(s.label) && !NOT_A_SLIP[`${s.file} · ${s.label}`]);
    expect(bare.map((s) => `${s.file}:${s.line} ${s.label}`)).toEqual([]);
  });

  it('every one excused is still a control with that label and no weight', () => {
    const bareNow = new Set(all.filter((s) => !s.weight).map((s) => `${s.file} · ${s.label}`));
    expect(Object.keys(NOT_A_SLIP).filter((k) => !bareNow.has(k))).toEqual([]);
  });

  it('the list of weighted controls is the code’s, line for line', () => {
    const now = all.filter((s) => s.weight).map(lineOf).sort();
    const written = [...listed()].sort();
    expect({ unlisted: now.filter((l) => !written.includes(l)), gone: written.filter((l) => !now.includes(l)) })
      .toEqual({ unlisted: [], gone: [] });
    expect(written).toEqual(now);
  });

  it('only the three weights are written (a component that passes its own on writes it as code)', () => {
    expect([...new Set(all.map((s) => s.weight).filter((w) => w && !w.startsWith('{')))].sort()).toEqual(['commit', 'destructive', 'wayOut']);
  });

  it('the purchase button commits', () => {
    const buy = all.filter((s) => s.file === 'src/components/society/PurchaseDock.tsx');
    expect(buy.length).toBeGreaterThan(0);
    expect(buy.map((s) => s.weight)).toEqual(buy.map(() => 'commit'));
  });
});
