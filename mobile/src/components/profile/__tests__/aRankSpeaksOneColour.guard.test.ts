/**
 * aRankSpeaksOneColour.guard.test.ts — a ranked member's file speaks one colour language (WORKLIST P4.54).
 *
 * Crimson meant three things on an Auteur's file: the rank, a loss (WALKED OUT, an abandoned film, a
 * falling rating) and a standing (MIDNIGHT DEVOTEE), so a walked-out film's ✕ and the Auteur's ✦ were
 * one red; the Archivist was drawn in three golds. The rule (the owner's, 2026-11-09): brass is the
 * house; a rank dresses the file in its one family; red on a member's file is the Auteur's alone, and
 * a loss fades; a destructive act keeps its red in the sheet it is asked in; the standing ladder
 * climbs in light and never borrows a rank's hue.
 *
 * Read from the sources the file is drawn from: every red ink in them is judged here, by file, with
 * its role, so a new mark in red (a loss, a state, an ember) fails until it is given its own colour.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { colors } from '@/src/theme/theme';
import { STANDING_LADDER } from '@/src/constants/standing';
import { files, rel } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..', '..');
const PROFILE = 'src/components/profile';

/** The sources a member's file is drawn from (own and another's are one screen, app/user). */
const FILE_SOURCES = [
  'app/user/[username].tsx',
  'app/(tabs)/profile.tsx',
  'src/components/RankBadge.tsx',
  'src/constants/standing.ts',
  ...files('appCode', { ext: ['.ts', '.tsx'], under: [PROFILE] }).map(rel),
];

/** Every red the theme holds, by name and by channel, and the Auteur stamp's inks. */
const RED = /colors\.(crimson|crimsonInk|crimsonBorder|crimsonFaint|bloodReel|bloodAged|danger|stampCrimsonHead|stampRuleInner)\b|rgba\(\s*(180,\s*45,\s*45|139,\s*(26|30),\s*(26|30)|227,\s*94,\s*88|226,\s*86,\s*79|220,\s*80,\s*80)|'#B42D2D'|STAMP_(RULE_AUTEUR|INK_AUTEUR|CRIMSON)\b/;

/** Each source's lines in red, and why each is red. A source not named here holds none. */
const JUDGED: Record<string, { lines: number; why: string }> = {
  'app/user/[username].tsx': { lines: 4, why: 'the Auteur\'s plate: its rule, its founding line, its stats frame, its spotlight' },
  'src/components/RankBadge.tsx': { lines: 6, why: 'the Auteur\'s stamp: its wash, its rule and its word, imported and drawn' },
  [`${PROFILE}/profileStyles.ts`]: { lines: 3, why: 'the Auteur\'s plate edge, the bio\'s « » and the foot\'s ✦' },
  [`${PROFILE}/ProfilePosterCard.tsx`]: { lines: 1, why: 'the Auteur\'s poster frame' },
  [`${PROFILE}/roomStyles.ts`]: { lines: 1, why: 'the Auteur\'s room thread' },
  [`${PROFILE}/ProfileTriptych.tsx`]: {
    lines: 8,
    why: 'the Auteur\'s altarpiece (frame, shadow, shimmer, hook, rail diamond, centre glow), and removing a film, a destructive act in the plate\'s sheet (its icon and its words)',
  },
  [`${PROFILE}/FollowRequestsPanel.tsx`]: { lines: 4, why: 'declining a request, a destructive act in the Notices sheet (drawn there, not on the file)' },
};

const redLinesOf = (source: string): number =>
  readFileSync(join(MOBILE, source), 'utf8').split('\n')
    .filter((l) => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && RED.test(l); }).length;

describe('red on a member\'s file is the Auteur\'s alone', () => {
  it('reads the file\'s sources, the rooms and the altarpiece among them', () => {
    expect(FILE_SOURCES).toEqual(expect.arrayContaining([
      `${PROFILE}/ProfileArchiveTab.tsx`, `${PROFILE}/ProfileLedgerTab.tsx`, `${PROFILE}/ProfileTriptych.tsx`, `${PROFILE}/ArchiveLock.tsx`,
    ]));
  });

  it('holds red only where it is judged: the Auteur\'s rank, or a destructive act in its sheet', () => {
    const found = Object.fromEntries(FILE_SOURCES.map((s) => [s, redLinesOf(s)]).filter(([, n]) => (n as number) > 0));
    expect(found).toEqual(Object.fromEntries(Object.entries(JUDGED).map(([s, j]) => [s, j.lines])));
  });

  it('draws a loss in the neutrals: walked out, abandoned, a falling rating', () => {
    const archive = readFileSync(join(MOBILE, PROFILE, 'ProfileArchiveTab.tsx'), 'utf8');
    const ledger = readFileSync(join(MOBILE, PROFILE, 'ProfileLedgerTab.tsx'), 'utf8');
    const poster = readFileSync(join(MOBILE, PROFILE, 'ProfilePosterCard.tsx'), 'utf8');
    expect(archive).toMatch(/walkMarkText: \{[^}]*color: colors\.fog/);
    expect(ledger).toMatch(/'DECAYING' \? <TrendingDown size=\{8\} color=\{colors\.fog\}/);
    expect(poster).toMatch(/<X size=\{7\} color=\{colors\.fog\}/);
  });
});

describe('a rank wears one family', () => {
  it('draws the Archivist in its one champagne: no goldenrod or pale gold left on the file', () => {
    // The goldenrod was the Archivist's third gold, nowhere else; the pale gold its shimmer's peak
    // (the calendar's flame button keeps the candle's own pale channel, the house's, not a rank's).
    const golds = FILE_SOURCES.filter((s) => /rgba\(\s*218,\s*165,\s*32/.test(readFileSync(join(MOBILE, s), 'utf8')));
    expect(golds).toEqual([]);
    const altarpiece = readFileSync(join(MOBILE, PROFILE, 'ProfileTriptych.tsx'), 'utf8');
    const archivistShimmer = /shimmerColors[^=]*= isArch\s*\?\s*\[([^\]]*)\]/.exec(altarpiece)?.[1] ?? '';
    expect(archivistShimmer.match(/rgba\([^)]*\)/g)).toEqual(['rgba(196,150,26,0.4)', 'rgba(196,150,26,0.85)', 'rgba(196,150,26,0.4)']);
  });

  it('climbs the standing ladder in light, borrowing no rank\'s hue', () => {
    const rankInks: string[] = [colors.crimson, colors.crimsonInk, colors.champagne];
    expect(STANDING_LADDER.filter((r) => rankInks.includes(r.color)).map((r) => r.name)).toEqual([]);
    expect(STANDING_LADDER.map((r) => r.color)).toEqual([colors.fog, colors.bone, colors.flicker, colors.silverScreen, colors.sepia]);
  });
});
