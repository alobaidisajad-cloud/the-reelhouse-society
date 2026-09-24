/**
 * WORDS ARE SOLID — the enumeration, as a test.
 * ──────────────────────────────────────────────────────────────────────────
 * A word drawn at partial opacity has no contrast of its own. It borrows it
 * from whatever is painted behind it that day — and the day the ground was
 * lit, 53 of the app's quiet words fell under 4.5:1 without a character of
 * their own code changing: `fog` at 0.8 had been budgeted against the old
 * black to scrape 4.59, and scraped nothing on a card.
 *
 * So the theme's law — opacity is for the thing a word SITS on, never the
 * word — is held here. Any text style whose colour carries an alpha, or which
 * sets its own `opacity`, must be named below as what it actually is:
 *
 *   a MARK      a glyph, an ornament, a corner flourish, a ghost initial
 *   a PICTURE   an exported image, which is never seen on this ground
 *   INACTIVE    a control that cannot be used right now — WCAG exempts it,
 *               and the dimming is the message
 *
 * A quiet WORD wears a quieter solid ink instead: fogQuiet, fog, bone, sepia.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { colors } from '../theme';

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['src', 'app'];

const ALLOWED: Record<string, string> = {
  // ── MARKS ────────────────────────────────────────────────────────────────
  'src/components/darkroom/DarkroomCards.tsx · posterPlaceholderGlyph': 'a glyph in an empty poster',
  'src/components/darkroom/DarkroomFilterPanel.tsx · yearRangeDash': '— between two years',
  'src/components/dispatch/paper/paperStyles.ts · indexDot': '· in the paper’s index',
  'src/components/dispatch/paper/paperStyles.ts · endMark': 'the end-of-article mark',
  'src/components/EmptyStates.tsx · glyph': 'the empty state’s emblem',
  'src/components/feed/PosterFrame.tsx · posterEmptyMark': 'a mark in an empty poster',
  'src/components/film/NitrateFileCard.tsx · posterFallbackMark': 'a mark on a missing poster',
  'src/components/film/NitrateFileCard.tsx · metaDot': '· between two facts',
  'src/components/home/FilmStripRow.tsx · posterPlaceholder': '✦ in an empty poster',
  'src/components/home/FilmTicker.tsx · tickerDot': '· between ticker items',
  'src/components/profile/ProfileArchiveTab.tsx · importDividerMark': 'the ornament on a divider',
  'src/components/profile/profileStyles.ts · searchIcon': 'an icon',
  'app/(tabs)/reels.tsx · searchIcon': 'an icon',
  'src/components/profile/profileStyles.ts · plateInitial': 'the ghost initial standing in for a portrait',
  'src/components/profile/profileStyles.ts · bioMark': '« » around a bio',
  'src/components/profile/profileStyles.ts · bioMarkRuby': '« » around an Auteur’s bio',
  'src/components/profile/profileStyles.ts · latelyIndex': 'index numerals repeating a list position',
  'src/components/profile/profileStyles.ts · footMark': '✦ closing a file',
  'src/components/profile/ProfileTriptych.tsx · emptyMark': 'a mark in an empty mount',
  'src/components/profile/ProjectorRoom.tsx · certCornerTL': 'a certificate corner flourish',
  'src/components/profile/ProjectorRoom.tsx · certCornerBR': 'a certificate corner flourish',
  'src/components/profile/roomStyles.ts · retrieveMark': 'the mark beside RETRIEVING',
  'src/components/profile/WatchlistRoulette.tsx · reelGlyph': 'a reel glyph',
  'src/components/RouteErrorBoundary.tsx · glyph': 'the error page’s emblem',
  'app/(tabs)/index.tsx · heroRuleDot': '· on the hero’s rule',
  'app/year-in-cinema.tsx · blankGlyph': 'a glyph in an empty cell',
  // ── PICTURES — exported images, never seen on this ground ───────────────
  'src/components/film/LogShareCard.tsx · title': 'the share card',
  'src/components/profile/TasteDNAExportCanvas.tsx · societyLabel': 'the Taste DNA export',
  'src/components/profile/TasteDNAExportCanvas.tsx · subtitle': 'the Taste DNA export',
  // ── INACTIVE CONTROLS — the dimming is the message ──────────────────────
  'src/features/settings/settings.styles.ts · navSaveText': 'SAVE while nothing has changed',
  'src/components/dispatch/paper/PaperComposer.tsx · inline:chs': 'FILE while the filing is blocked',
  'src/components/dispatch/paper/PaperDesk.tsx · inline:chs': 'FILE IT before the filing is ready',
  'app/(modals)/login.tsx · inline:submitText': 'the submit while the name is taken',
  'app/(modals)/notifications-modal.tsx · inline:markReadText': 'READ ALL when all are read',
};

const TYPE = /\b(fontFamily|fontSize|letterSpacing|lineHeight|fontStyle|textTransform|textDecorationLine)\s*:/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '__tests__', '__mocks__', 'mockups'].includes(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel);
  }
  return out;
}

/** The alpha a colour expression is drawn at: a token's own, or a literal's. */
function alphaOf(expr: string): number {
  const tok = /^colors\.(\w+)/.exec(expr);
  const raw = tok ? (colors as Record<string, string>)[tok[1]] ?? '' : expr.replace(/^['"]|['"]$/g, '');
  const a = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(raw.trim());
  return a ? Number(a[1]) : 1;
}

/** Style blocks: `key: { … }`, braces balanced, own level only (no nested objects). */
function blocks(src: string) {
  const out: { key: string; body: string }[] = [];
  const re = /(^|[\s{,])([A-Za-z_$][\w$]*)\s*:\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, d = 1;
    for (; i < src.length && d; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') d--;
    }
    let flat = '', depth = 0;
    for (const ch of src.slice(m.index + m[0].length, i - 1)) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (depth === 0) flat += ch;
    }
    out.push({ key: m[2], body: flat.replace(/\/\/[^\n]*/g, '') });
  }
  return out;
}

function census(): string[] {
  const found: string[] = [];
  for (const dir of SCAN) {
    for (const file of walk(dir)) {
      if (file === 'src/theme/theme.ts') continue;
      const src = readFileSync(join(ROOT, file), 'utf8');

      // 1 · text styles in a sheet
      for (const b of blocks(src)) {
        if (!TYPE.test(b.body)) continue;
        const col = /(?:^|[^A-Za-z])color\s*:\s*(colors\.\w+|'[^']*'|"[^"]*")/.exec(b.body);
        const op = /(?:^|[^A-Za-z])opacity\s*:\s*(0?\.\d+|0)\b/.exec(b.body);
        if ((col ? alphaOf(col[1]) : 1) < 1 || op) found.push(`${file} · ${b.key}`);
      }

      // 2 · inline on a <Text>: the override rides on a named style
      const tag = /<(?:Animated\.)?Text\b/g;
      let m: RegExpExecArray | null;
      while ((m = tag.exec(src))) {
        let i = m.index, d = 0;
        for (; i < src.length; i++) {
          if (src[i] === '{') d++;
          else if (src[i] === '}') d--;
          else if (src[i] === '>' && d === 0) break;
        }
        const style = /style=\{([\s\S]*)\}/.exec(src.slice(m.index, i));
        if (!style) continue;
        const s = style[1];
        // The opacity's whole EXPRESSION, not just a bare number: the Reel's
        // tab labels were `activeTab === 'logs' ? 1 : 0.75`, and a first
        // version of this test, reading only literals, walked straight past.
        const op = [...s.matchAll(/(?:^|[^A-Za-z])opacity\s*:\s*/g)].some((om) => {
          let d = 0, e = '';
          for (let k = (om.index ?? 0) + om[0].length; k < s.length; k++) {
            const ch = s[k];
            if ('([{'.includes(ch)) d++;
            else if (')]}'.includes(ch)) { if (d === 0) break; d--; }
            else if (ch === ',' && d === 0) break;
            e += ch;
          }
          return /(^|[^\d.])0?\.\d+/.test(e);
        });
        const al = /(?:^|[^A-Za-z])color\s*:\s*'rgba\([^)]*,\s*(0?\.\d+)\s*\)'/.test(s);
        if (!op && !al) continue;
        const rides = /\b\w+\.(\w+)/.exec(s);
        found.push(`${file} · inline:${rides ? rides[1] : '?'}`);
      }
    }
  }
  return found;
}

describe('words are solid', () => {
  const found = census();

  it('found see-through text at all', () => {
    // The marks, pictures and inactive controls on the list are real sites;
    // a census smaller than the list means the detector went blind.
    expect(found.length).toBeGreaterThanOrEqual(Object.keys(ALLOWED).length);
  });

  it('draws no WORD see-through — every one is a named mark, picture or inactive control', () => {
    expect(found.filter((f) => !(f in ALLOWED))).toEqual([]);
  });

  it('and everything on the list is still drawn', () => {
    const seen = new Set(found);
    expect(Object.keys(ALLOWED).filter((k) => !seen.has(k))).toEqual([]);
  });
});
