/**
 * WORDS ARE NOT MARKS — the enumeration, as a test.
 * ──────────────────────────────────────────────────────────────────────────
 * The theme keeps two kinds of colour, and says so: PIGMENTS for marks, and
 * INKS for words. `crimson` is a pigment — a filled heart or a ballot's cross
 * at that colour is a shape, and a shape reads on any ground. A 9pt word is
 * not a shape. The same crimson set as a word measures 2.78:1 on a card, and
 * `bloodReel` 1.48, and `ash` — the border colour — 1.10, which is to say the
 * word is not there at all.
 *
 * Fifty-eight words were painted that way when this was written: the
 * settings page's DELETE ACCOUNT at 1.66:1, every "ABANDONED" stamp, an
 * Auteur's pull quote, three sign-in errors, a founding member's own title.
 * Each was somebody reaching for "the red" or "the quiet grey" and finding the
 * pigment first.
 *
 * So a style that sets a mark pigment as its `color` must be on the list
 * below, with what it DRAWS. Anything else is a word, and a word wears an ink:
 *
 *   crimson / bloodReel  →  crimsonInk     ash  →  fogQuiet
 *
 * What this cannot see: a pigment held in a variable and handed to `color`
 * later (`const tierText = … '#B42D2D' …` was one). The rendered-screen
 * contrast sweep is the backstop for those; this is the gate at the door.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { colors } from '../theme';

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['src', 'app'];

/** The pigments, by token and by every spelling of their value. */
const PIGMENT_TOKENS = ['bloodReel', 'crimson', 'ash', 'tarnish', 'tarnishDeep'] as const;
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
const PIGMENT_VALUES = new Map<string, string>(
  PIGMENT_TOKENS.map((t) => [channels((colors as Record<string, string>)[t]), t]),
);

/**
 * THE MARKS. Keyed `file · style key` (or `file · inline:<what it prints>`),
 * each with what it draws. A shape, a glyph, or a fill — never a word.
 */
const MARKS: Record<string, string> = {
  'src/components/AutopsyGauge.tsx · headerStar': '✦ beside the heading',
  'src/components/Decorative.tsx · reelEmpty': '◉ an unlit reel in a rating',
  'src/components/RatingLegend.tsx · reelEmpty': '◉ an unlit reel in the legend',
  'src/components/ErrorBoundary.tsx · glyph': '⊗ / ✦ at 48pt, the page’s emblem',
  'app/+not-found.tsx · glyph': '⊗ / ✦ at 48pt, the page’s emblem',
  'app/auth-callback.tsx · errorIcon': '✕ at 28pt beside the words that say what failed',
  'app/reset-password.tsx · inline:✕': '✕ above SESSION EXPIRED, which carries the meaning',
  'src/components/log/logDetailStyles.ts · filingDot': '· between two filing facts',
  'src/components/profile/Achievements.tsx · glyphLocked': 'a locked badge’s glyph; its title is inked',
  'src/components/profile/CinematicInsights.tsx · avatarFallback': '✦ standing in for a missing portrait',
  'src/components/profile/profileStyles.ts · bioMarkRuby': '« » around an Auteur’s bio',
  'src/components/profile/profileStyles.ts · footMarkRuby': '✦ closing an Auteur’s file',
  'app/stacks/[id].tsx · placeholderMark': '✦ in an empty poster well',
  'app/(admin)/tribunal.tsx · suspend': 'the verdict button’s FILL; its title reads `ink`',
  'app/(admin)/tribunal.tsx · ban': 'the verdict button’s FILL; its title reads `ink`',
  'app/(admin)/tribunal.tsx · permanent_exile': 'the verdict button’s FILL; its title reads `ink`',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', '__tests__', '__mocks__', 'mockups'].includes(e.name)) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(rel);
  }
  return out;
}

/** The style key a `color:` sits inside: the nearest enclosing `key: {`. */
function keyAt(lines: string[], i: number, col: number): string {
  let depth = 0;
  for (let j = i; j >= 0; j--) {
    const seg = j === i ? lines[j].slice(0, col) : lines[j];
    for (let k = seg.length - 1; k >= 0; k--) {
      if (seg[k] === '}') depth++;
      else if (seg[k] === '{') {
        if (depth === 0) {
          const m = /([A-Za-z_$][\w$]*)\s*:\s*$/.exec(seg.slice(0, k));
          return m ? m[1] : '';
        }
        depth--;
      }
    }
  }
  return '';
}

/** Every `color:` in the app that resolves to a mark pigment. */
function census() {
  const hits: { at: string; key: string }[] = [];
  const COLOR = /(^|[^A-Za-z])color:\s*(colors\.(\w+)|'([^']+)'|"([^"]+)")/g;
  for (const dir of SCAN) {
    for (const file of walk(dir)) {
      if (file === 'src/theme/theme.ts') continue;
      const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
        for (const m of ln.matchAll(COLOR)) {
          const token = m[3];
          const literal = m[4] ?? m[5];
          let pigment: string | undefined;
          if (token && (PIGMENT_TOKENS as readonly string[]).includes(token)) pigment = token;
          if (literal) {
            const hex = /^#([0-9a-fA-F]{6})$/.exec(literal);
            const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(literal);
            const ch = hex ? channels(literal) : fn ? `${+fn[1]},${+fn[2]},${+fn[3]}` : '';
            pigment = PIGMENT_VALUES.get(ch);
          }
          if (!pigment) continue;
          const col = (m.index ?? 0) + m[1].length;
          let key = keyAt(lines, i, col);
          // an inline style names itself by what it prints
          if (!key || /^(style|s|st)$/.test(key)) {
            const printed = />([^<{]+)</.exec(ln.slice(col));
            key = `inline:${printed ? printed[1].trim() : '?'}`;
          }
          hits.push({ at: `${file}:${i + 1} (${pigment})`, key: `${file} · ${key}` });
        }
      });
    }
  }
  return hits;
}

describe('words are not marks', () => {
  const hits = census();

  it('found the pigments at all', () => {
    // A detector that matches nothing reports a clean app. Every mark on the
    // list is a real site, so the census can never be smaller than the list.
    expect(hits.length).toBeGreaterThanOrEqual(Object.keys(MARKS).length);
  });

  it('paints no word in a pigment — every pigment colour is a named mark', () => {
    const words = hits.filter((h) => !(h.key in MARKS));
    expect(words.map((h) => `${h.at}  ${h.key}`)).toEqual([]);
  });

  it('and every mark on the list is still a mark somebody draws', () => {
    // An allow-list nobody prunes is how fifty-eight words got in.
    const seen = new Set(hits.map((h) => h.key));
    expect(Object.keys(MARKS).filter((k) => !seen.has(k))).toEqual([]);
  });

  it('keeps the inks the words moved to clear the floor on the lightest ground', () => {
    // The replacement is only a fix if it holds where it is hardest: the
    // raised surface, the lightest of the five.
    const lum = (hex: string) => {
      const s = [1, 3, 5].map((i) => {
        const u = parseInt(hex.slice(i, i + 2), 16) / 255;
        return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    for (const ink of [colors.crimsonInk, colors.fogQuiet]) {
      for (const ground of [colors.inkwell, colors.ink, colors.well, colors.soot, colors.sootAuteur, colors.surfaceRaised]) {
        expect(ratio(ink, ground)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
