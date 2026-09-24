/**
 * A BOX THAT HOLDS TEXT GROWS WITH THE TEXT — AND THE TEXT IS NEVER GROWN TWICE.
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native grows `fontSize` and `lineHeight` with the member's text-size
 * setting, by itself, on both platforms. It does not grow a box. So two faults
 * are possible, and this app had both:
 *
 *   A BOX FIXED IN POINTS around lines that grow. At the largest setting a
 *   filmography title's second line was cut off ("In the Mood for"), the cast
 *   rail's names ran 7pt past its end, and a one-line caption's cell came out
 *   shorter than a two-line one, so a grid lost its baseline.
 *
 *   A LINE GROWN IN JAVASCRIPT, which the phone then grows again. The essay did
 *   it on the belief that `lineHeight` was fixed, and was set at nearly twice
 *   its leading for exactly the members who had asked for larger type.
 *
 * The rules, all read from source:
 *
 *   1. The setting is read in ONE place, `useTextScale`. Anything else reading
 *      `fontScale` is a second, unguarded opinion about it.
 *   2. What `useTextScale` returns multiplies BOXES. A file that uses it may not
 *      put it into a `fontSize` or a `lineHeight`.
 *   3. A text style carries no fixed height. The one exception is a typing
 *      field: a minimum grows, and a fixed-height field scrolls its own text.
 *      Whether a style is a field is read from the code (a `<TextInput>` that
 *      wears it), never from its name.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const HOOK = 'src/hooks/useTextScale.ts';

function sources(): { file: string; src: string }[] {
  const out: { file: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) {
        if (!['node_modules', '__tests__', '__mocks__'].includes(d.name)) walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(d.name) && !/\.test\./.test(d.name)) {
        out.push({ file: relative(ROOT, p).split(sep).join('/'), src: readFileSync(p, 'utf8') });
      }
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'app'));
  return out;
}

/** Code only: a comment may name `fontScale` to explain why it is not read. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ALL = sources();

/** Every `name: { ... }` object literal with a font size and a fixed height. */
function fixedTextBoxes(src: string): { name: string; prop: string }[] {
  const out: { name: string; prop: string }[] = [];
  const re = /([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (!/\bfontSize\s*:/.test(m[2])) continue;
    const h = /\b(height|minHeight|maxHeight)\s*:/.exec(m[2]);
    if (h) out.push({ name: m[1], prop: h[1] });
  }
  return out;
}

/** Every style key worn by a `<TextInput>` anywhere in the app. */
function fieldStyles(): Set<string> {
  const worn = new Set<string>();
  for (const { src } of ALL) {
    const tag = /<TextInput\b[\s\S]*?\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(src))) {
      const style = /style=\{([\s\S]*?)\}\s*(?:[a-zA-Z]+=|\/?>|\{\.\.\.)/.exec(m[0]);
      if (!style) continue;
      for (const k of style[1].matchAll(/\.([A-Za-z_$][\w$]*)/g)) worn.add(k[1]);
    }
  }
  return worn;
}

describe('the text-size setting is read in one place', () => {
  it('nothing but useTextScale reads fontScale', () => {
    const readers = ALL
      .filter(({ file, src }) => file !== HOOK && /\bfontScale\b|getFontScale\s*\(/.test(code(src)))
      .map(({ file }) => file);
    expect(readers).toEqual([]);
  });

  /** What each hook returns, on each platform, at each setting that matters. */
  describe.each(['ios', 'android'] as const)('on %s', (os) => {
    const RN = require('react-native');
    const at = (fontScale: number, fn: (c?: number) => number, ceiling?: number) => {
      const was = RN.Platform.OS;
      const dims = jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
      RN.Platform.OS = os;
      try { return fn(ceiling); } finally { RN.Platform.OS = was; dims.mockRestore(); }
    };
    const { useTextScale, useLineScale } = require('@/src/hooks/useTextScale');

    it('both are 1 at the default size', () => {
      expect(at(1, useTextScale)).toBe(1);
      expect(at(1, useLineScale)).toBe(1);
    });

    it('a font-height line stops at the app\'s ceiling', () => {
      expect(at(2, useTextScale)).toBe(1.35);
      expect(at(2, useTextScale, 1.2)).toBe(1.2);
      expect(at(1.1, useTextScale)).toBe(1.1);
    });

    it(os === 'android' ? 'a SET line keeps growing past the ceiling' : 'a SET line stops at the ceiling too', () => {
      expect(at(2, useLineScale)).toBe(os === 'android' ? 2 : 1.35);
      expect(at(2, useLineScale, 1.2)).toBe(os === 'android' ? 2 : 1.2);
      expect(at(1.1, useLineScale)).toBe(1.1);
    });
  });
});

describe('the scale multiplies boxes, never type', () => {
  const HOOKS = 'use(?:Text|Line)Scale';
  const users = ALL.filter(({ file, src }) => file !== HOOK && new RegExp(`\\b${HOOKS}\\s*\\(`).test(src));

  it('is used where a box reserves lines (the check reads real files)', () => {
    expect(users.map(({ file }) => file).sort()).toEqual([
      'app/stacks/[id].tsx',
      // a WIDTH, not a height: the name's longest word against its column
      'app/user/[username].tsx',
      'src/components/film/CastCarousel.tsx',
      'src/components/person/PersonFilmography.tsx',
    ]);
  });

  /**
   * A line with a SET lineHeight keeps growing past the ceiling on Android, so
   * its box needs `useLineScale`. `useTextScale` is right only where the lines
   * take their height from the font — the cast card's name and role, which set
   * none. If either ever sets one, this fails and the rail must change hooks.
   */
  it('a box around a SET lineHeight uses useLineScale; useTextScale only where none is set', () => {
    const at = (f: string) => code(ALL.find(({ file }) => file === f)!.src);
    expect(at('src/components/person/PersonFilmography.tsx')).toMatch(/useLineScale\(/);
    expect(at('app/stacks/[id].tsx')).toMatch(/useLineScale\(/);
    const cast = at('src/components/film/CastCarousel.tsx');
    expect(cast).toMatch(/useTextScale\(/);
    for (const style of ['castName', 'castRole']) {
      const body = new RegExp(`${style}\\s*:\\s*\\{([^{}]*)\\}`).exec(cast)?.[1];
      expect(body).toBeDefined();
      expect(body).not.toMatch(/lineHeight/);
    }
  });

  it.each(['fontSize', 'lineHeight'])('no file that reads the scale puts it into a %s', (prop) => {
    for (const { file, src } of users) {
      // the names this file gives the scale, or anything computed from it
      const names = [...code(src).matchAll(new RegExp(`(?:const|let)\\s+(?:\\{\\s*)?([A-Za-z_$][\\w$]*)[^=\\n]*=\\s*[^;\\n]*${HOOKS}\\s*\\(`, 'g'))].map((m) => m[1]);
      const inline = new RegExp(`\\b${prop}\\s*:[^,}\\n]*${HOOKS}`);
      expect({ file, hit: inline.test(code(src)) }).toEqual({ file, hit: false });
      for (const n of names) {
        const viaName = new RegExp(`\\b${prop}\\s*:[^,}\\n]*\\b${n}\\b`);
        expect({ file, name: n, hit: viaName.test(code(src)) }).toEqual({ file, name: n, hit: false });
      }
    }
  });

  it('the essay no longer grows its own leading', () => {
    const all = ALL.map(({ src }) => code(src)).join('\n');
    expect(all).not.toMatch(/\bwithLeading\b|\buseEssayLeading\b/);
  });
});

describe('a text style carries no fixed height, unless it is a typing field', () => {
  const fields = fieldStyles();

  it('finds the typing fields at all, so an empty set cannot pass for a clean one', () => {
    expect(fields.size).toBeGreaterThan(5);
    expect(fields.has('reviewInput')).toBe(true);
  });

  it('every text style with a fixed height is worn by a <TextInput>', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { file, src } of ALL) {
      for (const { name, prop } of fixedTextBoxes(code(src))) {
        seen++;
        if (!fields.has(name)) bad.push(`${file}  ${name}  (${prop})`);
      }
    }
    // the scan finds the fields it is allowed to find — proof it is reading
    expect(seen).toBeGreaterThan(5);
    expect(bad).toEqual([]);
  });
});
