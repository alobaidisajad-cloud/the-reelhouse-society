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
 * Seventy-odd words were painted that way when this was written: the
 * settings page's DELETE ACCOUNT at 1.66:1, every "ABANDONED" stamp, an
 * Auteur's pull quote, three sign-in errors, a founding member's own title,
 * every Auteur index entry's name, "WEAK" on the password meter at 1.48, and
 * twelve placeholders in the border colour — hints nobody could see.
 *
 * ── THE PIGMENT LIST IS COMPUTED, NOT CHOSEN ──────────────────────────────
 * The first version of this file listed five pigments by hand, and the green
 * (`validation`, 4.37 on a card) and `rust` (2.46) walked straight past it.
 * So: every solid colour in the theme that is lighter than a card and still
 * fails 4.5:1 on one is a pigment. A new one joins the list by existing.
 *
 * A pigment anywhere in a `color:` expression — a ternary included — must be
 * a named mark below, with what it draws. A placeholder is always a word.
 * Anything else wears the family's ink: crimsonInk, fogQuiet or fog,
 * validationInk, rustInk.
 *
 * What this cannot see: a pigment held in a variable and handed to `color`
 * later. Those were found by tracing every pigment held in a name to where it
 * lands (the index entry, the strength meter, lounge settings, the clearance
 * gates); the rendered-screen contrast sweep is the standing backstop.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { colors } from '../theme';

const ROOT = join(__dirname, '..', '..', '..');
const SCAN = ['src', 'app'];

// ── contrast ──────────────────────────────────────────────────────────────
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const s = c.map((v) => {
    const u = v / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const CARD = rgb(colors.soot);

/** Every solid token lighter than a card that fails 4.5:1 on one. */
const SOLID = Object.entries(colors as Record<string, string>)
  .filter(([, v]) => /^#[0-9A-Fa-f]{6}$/.test(v));
const PIGMENTS = new Map<string, string>(
  SOLID.filter(([, v]) => lum(rgb(v)) > lum(CARD) && ratio(rgb(v), CARD) < 4.5)
    .map(([k]) => [k, k]),
);
/** …and every spelling of their values, so a hex or an rgb() cannot hide one. */
const PIGMENT_VALUES = new Map<string, string>(
  [...PIGMENTS.keys()].map((k) => [rgb((colors as Record<string, string>)[k]).join(','), k]),
);

/**
 * THE MARKS. Keyed `file · name`, where the name is the style key, or the
 * named style an inline override rides on, or the const it is assigned to —
 * each with what it draws. A shape, a glyph, an icon or a fill; never a word.
 */
const MARKS: Record<string, string> = {
  'src/components/AutopsyGauge.tsx · headerStar': '✦ beside the heading',
  'src/components/Decorative.tsx · reelEmpty': '◉ an unlit reel in a rating',
  'src/components/RatingLegend.tsx · reelEmpty': '◉ an unlit reel in the legend',
  'src/components/ErrorBoundary.tsx · glyph': '⊗ / ✦ at 48pt, the page’s emblem',
  'app/+not-found.tsx · glyph': '⊗ / ✦ at 48pt, the page’s emblem',
  'app/auth-callback.tsx · errorIcon': '✕ at 28pt beside the words that say what failed',
  'app/reset-password.tsx · successIcon': '✕ above SESSION EXPIRED, which carries the meaning',
  'src/components/log/logDetailStyles.ts · filingDot': '· between two filing facts',
  'src/components/profile/Achievements.tsx · glyphLocked': 'a locked badge’s glyph; its title is inked',
  'src/components/profile/CinematicInsights.tsx · avatarFallback': '✦ standing in for a missing portrait',
  'src/components/profile/profileStyles.ts · bioMarkRuby': '« » around an Auteur’s bio',
  'src/components/profile/profileStyles.ts · footMarkRuby': '✦ closing an Auteur’s file',
  'app/stacks/[id].tsx · placeholderMark': '✦ in an empty poster well',
  'app/(admin)/tribunal.tsx · suspend': 'the verdict button’s FILL; its title reads `ink`',
  'app/(admin)/tribunal.tsx · ban': 'the verdict button’s FILL; its title reads `ink`',
  'app/(admin)/tribunal.tsx · permanent_exile': 'the verdict button’s FILL; its title reads `ink`',
  'src/components/auth/PasswordStrengthMeter.tsx · checkIcon': '✓ / ○ beside a requirement; the label is inked',
  'src/components/darkroom/DarkroomHeader.tsx · animatedSearchProps': 'the search icon’s ember',
  'src/components/profile/ProfileLedgerTab.tsx · animatedSearchProps': 'the search icon’s ember',
  'src/components/profile/ProfileWatchlistTab.tsx · animatedSearchProps': 'the search icon’s ember',
  'src/components/profile/ProfileTriptych.tsx · animatedSearchProps': 'the search icon’s ember',
  'app/(modals)/list-modal.tsx · animatedIconProps': 'the search icon’s ember',
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

/** What a `color:` at (line, col) belongs to — see MARKS for the naming. */
function nameAt(lines: string[], i: number, col: number): string {
  // 1 · the enclosing `key: {`
  let depth = 0;
  for (let j = i; j >= 0 && j > i - 40; j--) {
    const seg = j === i ? lines[j].slice(0, col) : lines[j];
    for (let k = seg.length - 1; k >= 0; k--) {
      if (seg[k] === '}') depth++;
      else if (seg[k] === '{') {
        if (depth === 0) {
          const before = seg.slice(0, k);
          const key = /([A-Za-z_$][\w$]*)\s*:\s*$/.exec(before);
          if (key && !/^(style|contentContainerStyle)$/.test(key[1])) return key[1];
          // 2 · an inline override riding on a named style: [s.checkIcon, { color: … }]
          const rides = /\b\w+\.(\w+)\s*,\s*[^,[]*$/.exec(before);
          if (rides) return rides[1];
          // 3 · the const it is assigned to: const animatedSearchProps = useAnimatedProps(() => ({
          for (let b = j; b >= 0 && b > j - 3; b--) {
            const c = /const\s+(\w+)\s*=/.exec(lines[b]);
            if (c) return c[1];
          }
          return '?';
        }
        depth--;
      }
    }
  }
  return '?';
}

/** The value expression after `color:` — up to the comma or brace that ends it. */
function exprAfter(ln: string, from: number): string {
  let d = 0, out = '';
  for (let k = from; k < ln.length; k++) {
    const ch = ln[k];
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') { if (d === 0) break; d--; }
    else if (ch === ',' && d === 0) break;
    out += ch;
  }
  return out;
}

/** The pigments an expression names, by token or by any spelling of the value. */
function pigmentsIn(expr: string): string[] {
  const found: string[] = [];
  for (const m of expr.matchAll(/colors\.(\w+)/g)) if (PIGMENTS.has(m[1])) found.push(m[1]);
  for (const m of expr.matchAll(/'(#[0-9A-Fa-f]{6})'|'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    const key = m[1] ? rgb(m[1]).join(',') : `${+m[2]},${+m[3]},${+m[4]}`;
    const p = PIGMENT_VALUES.get(key);
    if (p) found.push(p);
  }
  return found;
}

function census() {
  const colour: { at: string; key: string }[] = [];
  const placeholders: string[] = [];
  for (const dir of SCAN) {
    for (const file of walk(dir)) {
      if (file === 'src/theme/theme.ts') continue;
      const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
      lines.forEach((ln, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
        for (const m of ln.matchAll(/(^|[^A-Za-z])color\s*:\s*/g)) {
          const col = (m.index ?? 0) + m[1].length;
          const ps = pigmentsIn(exprAfter(ln, col + m[0].length - m[1].length));
          if (!ps.length) continue;
          colour.push({ at: `${file}:${i + 1} (${ps.join(', ')})`, key: `${file} · ${nameAt(lines, i, col)}` });
        }
        for (const m of ln.matchAll(/placeholderTextColor=\{([^}]*)\}/g)) {
          if (pigmentsIn(m[1]).length) placeholders.push(`${file}:${i + 1} ${m[1].trim()}`);
        }
      });
    }
  }
  return { colour, placeholders };
}

describe('words are not marks', () => {
  const { colour, placeholders } = census();

  it('computes a pigment list that holds every colour the pass found painted as a word', () => {
    // The two the hand-written list missed, and the five it had.
    for (const p of ['bloodReel', 'crimson', 'ash', 'tarnish', 'tarnishDeep', 'validation', 'rust']) {
      expect(PIGMENTS.has(p)).toBe(true);
    }
    // …and no ink: a word-ink on this list would make every word a mark.
    for (const ink of ['crimsonInk', 'fogQuiet', 'fog', 'validationInk', 'rustInk', 'sepia', 'bone', 'parchment']) {
      expect(PIGMENTS.has(ink)).toBe(false);
    }
  });

  it('found the pigments at all', () => {
    // A detector that matches nothing reports a clean app. Every mark on the
    // list is a real site, so the census can never be smaller than the list.
    expect(colour.length).toBeGreaterThanOrEqual(Object.keys(MARKS).length);
  });

  it('paints no word in a pigment — every pigment colour is a named mark', () => {
    const words = colour.filter((h) => !(h.key in MARKS));
    expect(words.map((h) => `${h.at}  ${h.key}`)).toEqual([]);
  });

  it('never writes a placeholder in a pigment — a hint is a word', () => {
    expect(placeholders).toEqual([]);
  });

  it('and every mark on the list is still a mark somebody draws', () => {
    // An allow-list nobody prunes is how seventy words got in.
    const seen = new Set(colour.map((h) => h.key));
    expect(Object.keys(MARKS).filter((k) => !seen.has(k))).toEqual([]);
  });

  it('keeps every word-ink clear of the floor on every ground a word can sit on', () => {
    // The replacement is only a fix if it holds where it is hardest.
    const grounds = [colors.inkwell, colors.ink, colors.well, colors.soot, colors.sootAuteur, colors.surfaceRaised];
    for (const ink of [colors.crimsonInk, colors.fogQuiet, colors.fog, colors.validationInk, colors.rustInk]) {
      for (const g of grounds) expect(ratio(rgb(ink), rgb(g))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
