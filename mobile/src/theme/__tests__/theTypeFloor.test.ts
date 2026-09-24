/**
 * THE TYPE FLOOR — every word a member reads is at least 10pt.
 * ─────────────────────────────────────────────────────────────────────────────
 * Small type in this app was sized by arithmetic: a label got whatever was left
 * after the chrome around it was paid for, and 7.5, 8 and 8.5pt spread through
 * the screens a member reads most. The floor was raised in one pass — 79 files,
 * with each label's tracking tightened by (old/new)² so it grew taller rather
 * than wider, and every render measured at 1× and 1.35× on both platforms
 * afterwards (mockups/tools/layout.cjs).
 *
 * This keeps it raised. Every `fontSize` in the app — a number, or a constant
 * that holds one — is at least 10, unless it is named below with the reason it
 * may be smaller:
 *
 *   BADGE    a small corner badge: at least 9.
 *   KEEP     not a word to read: a MARK (a glyph standing for a thing), a STAMP
 *            (a printed seal, part of a picture), an ORDINAL (a numeral in the
 *            ordering margin), or a PICTURE (an image exported to share).
 *   SETTLED  the Lobby and the member's profile, which were approved as they
 *            are ("nothing moves on the profile or the Lobby except colour and
 *            light"). Not exempt from being right — only from this floor.
 *
 * An exemption that no longer matches anything small FAILS: an entry for a
 * label that has since grown is a door left open for the next one to shrink.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const FLOOR = 10;
const BADGE_FLOOR = 9;

const SETTLED = [
  /^app\/\(tabs\)\/index\.tsx$/, /^src\/components\/home\//,
  /^app\/user\//, /^app\/\(tabs\)\/profile\.tsx$/, /^src\/components\/profile\//,
];

const KEEP: Record<string, 'mark' | 'stamp' | 'ordinal' | 'picture'> = {
  'src/components/EmptyStates.tsx · dividerGlyph': 'mark',
  'src/components/dispatch/paper/paperStyles.ts · indexDot': 'mark',
  'src/components/dispatch/SeriesPicker.tsx · tick': 'mark',
  'src/components/search/SearchResultRow.tsx · badgeGlyph': 'mark',
  'src/components/search/SearchResultRow.tsx · rowRating': 'mark',
  'app/(tabs)/reels.tsx · searchIcon': 'mark',
  'src/components/dispatch/paper/paperStyles.ts · stampText': 'stamp',
  'src/components/feed/AutopsyView.tsx · stripConfidential': 'stamp',
  'src/components/log/logDetailStyles.ts · autopsyToggleConf': 'stamp',
  'src/components/AutopsyGauge.tsx · confidential': 'stamp',
  'src/components/RankBadge.tsx · word': 'stamp',
  'src/components/dispatch/paper/paperStyles.ts · optionNo': 'ordinal',
  'src/components/dispatch/paper/PaperDesk.tsx · slotNo': 'ordinal',
  'src/components/dispatch/paper/PaperMore.tsx · cardFrom': 'picture',
};
/** A whole file that is an exported picture: the share card is an image. */
const KEEP_FILES: Record<string, 'picture'> = { 'src/components/film/NitrateFileCard.tsx': 'picture' };

const BADGE = new Set([
  'app/(admin)/tribunal.tsx · typeBadgeText',
  'app/(admin)/tribunal.tsx · warningBadgeText',
  'app/(admin)/tribunal.tsx · reportCountBadgeText',
  'app/(modals)/search-modal.tsx · tabCountNum',
  'app/stacks/[id].tsx · metaChipText',
  'src/components/darkroom/DarkroomHeader.tsx · filterBadgeText',
  'src/components/feed/ActivityCard.tsx · editorialBadgeText',
  'src/components/log/logDetailStyles.ts · editorialBadgeText',
  'src/components/film/FilmHero.tsx · loggedBadgeText',
  'src/components/film/FilmHero.tsx · prestigeText',
  'src/components/film/FilmMediaCarousel.tsx · videoType',
  'src/components/log/LogModalStyles.ts · editBadgeText',
  'src/components/log/LogModalStyles.ts · altBadgeText',
  'src/components/lounge/JoinedLoungeCard.tsx · unreadSealText',
  'src/components/lounge/JoinedLoungeCard.tsx · doorBadgeText',
  'src/components/lounge/JoinedLoungeCard.tsx · awaitingText',
  'src/components/lounge/PublicLoungeCard.tsx · publicPrivateText',
  'src/components/lounge/LoungeSettingsPanel.tsx · statusTagText',
  'src/components/lounge/LoungeSettingsPanel.tsx · founderText',
  'src/components/reels/ReelsCards.tsx · stackCardBadgeText',
  'src/components/reels/ReelsCards.tsx · stackCertifyText',
  'src/components/reels/ReelsCards.tsx · stackCardRefText',
  'src/components/reels/MemberRegistry.tsx · serial',
  'src/features/settings/SettingsSections.tsx · activeBadgeText',
]);

function sources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) { if (!['node_modules', '__tests__', '__mocks__'].includes(d.name)) walk(p); }
      else if (/\.tsx?$/.test(d.name) && !/\.test\./.test(d.name)) {
        out.push({ file: relative(ROOT, p).split(sep).join('/'), src: readFileSync(p, 'utf8').replace(/\r\n/g, '\n') });
      }
    }
  };
  walk(join(ROOT, 'app'));
  walk(join(ROOT, 'src'));
  return out;
}

/** Comments out, so a sentence ABOUT a size is not read as one. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');

/** The name of the style object enclosing index i: `name: {` or `(inline)`. */
function styleName(s: string, i: number): string {
  let depth = 0;
  let a = i;
  for (; a >= 0; a--) {
    if (s[a] === '}') depth++;
    else if (s[a] === '{') { if (depth === 0) break; depth--; }
  }
  const m = /(\w+)\s*:\s*$/.exec(s.slice(Math.max(0, a - 80), a));
  return m ? m[1] : '(inline)';
}

type Size = { key: string; file: string; size: number; line: number };

/** Every fontSize in the app whose value is known: a number, or a module constant holding one. */
function sizes(): Size[] {
  const out: Size[] = [];
  for (const { file, src } of sources()) {
    const s = code(src);
    const consts = new Map<string, number>();
    for (const m of s.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*([\d.]+)\s*;/g)) consts.set(m[1], +m[2]);
    for (const m of s.matchAll(/fontSize\s*:\s*([\d.]+|[A-Z_][A-Z0-9_]*)\b/g)) {
      const size = /^[\d.]+$/.test(m[1]) ? +m[1] : consts.get(m[1]);
      if (size === undefined) continue;
      out.push({ key: `${file} · ${styleName(s, m.index!)}`, file, size, line: s.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

const ALL = sizes();
const settled = (f: string) => SETTLED.some((r) => r.test(f));

describe('the type floor', () => {
  it('reads the app at all, so a silent zero cannot pass for a clean sweep', () => {
    expect(ALL.length).toBeGreaterThan(1000);
    // and it resolves named sizes, not only numbers
    expect(ALL.some((x) => x.key === 'src/components/film/CastCarousel.tsx · castRole' && x.size === 10)).toBe(true);
  });

  it(`every word a member reads is at least ${FLOOR}pt`, () => {
    const under = ALL
      .filter((x) => x.size < FLOOR && !settled(x.file) && !KEEP_FILES[x.file] && !KEEP[x.key] && !BADGE.has(x.key))
      .map((x) => `${x.file}:${x.line}  ${x.key.split(' · ')[1]}  ${x.size}pt`);
    expect(under).toEqual([]);
  });

  it(`a corner badge is at least ${BADGE_FLOOR}pt`, () => {
    const under = ALL.filter((x) => BADGE.has(x.key) && x.size < BADGE_FLOOR).map((x) => `${x.key}  ${x.size}pt`);
    expect(under).toEqual([]);
  });

  it('every exemption still names something small — none is left open', () => {
    const small = new Set(ALL.filter((x) => x.size < FLOOR).map((x) => x.key));
    const smallFiles = new Set(ALL.filter((x) => x.size < FLOOR).map((x) => x.file));
    const stale = [
      ...Object.keys(KEEP).filter((k) => !small.has(k)),
      ...[...BADGE].filter((k) => !small.has(k)),
      ...Object.keys(KEEP_FILES).filter((f) => !smallFiles.has(f)),
    ];
    expect(stale).toEqual([]);
  });

  it('the theme\'s own scale starts at the floor', () => {
    const theme = code(readFileSync(join(ROOT, 'src', 'theme', 'theme.ts'), 'utf8'));
    for (const name of ['micro', 'label']) {
      const m = new RegExp(`\\b${name}\\s*:\\s*\\{[^}]*fontSize\\s*:\\s*([\\d.]+)`).exec(theme);
      expect(m).not.toBeNull();
      expect(+m![1]).toBeGreaterThanOrEqual(FLOOR);
    }
  });
});
