/**
 * A PHOTOGRAPH IS NOT A LIT SURFACE.
 * ──────────────────────────────────────────────────────────────────────────
 * The edge light (EDGE_LIT) is how a card catches the booth light: a bright
 * hairline on its top edge and a faint falloff down its face. It belongs on a
 * surface painted in a card colour. Laid on an IMAGE it draws a hairline
 * across the top of the picture itself — and it was, on three: the film
 * page's poster, the similar-films posters and the footage stills, because
 * each shared one style with its empty placeholder frame, and the sweep that
 * lit the frames lit the pictures with them.
 *
 * So: no element that draws a picture wears a style that spreads EDGE_LIT.
 * Its empty frame may.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(p, 'utf8');

/** The index of the `}` that closes the `{` at `open`. */
function closing(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return i; }
  }
  return src.length;
}

/** Style names that spread EDGE_LIT anywhere in their object, per sheet in a file. */
function litSheets(src: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const m of src.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*StyleSheet\.create\(\{/g)) {
    const start = (m.index ?? 0) + m[0].length - 1;
    const sheet = src.slice(start, closing(src, start) + 1);
    const lit = new Set<string>();
    for (const k of sheet.matchAll(/(\b\w+)\s*:\s*\{/g)) {
      const open = (k.index ?? 0) + k[0].length - 1;
      if (/\.\.\.EDGE_LIT\b/.test(sheet.slice(open, closing(sheet, open)))) lit.add(k[1]);
    }
    out[m[1]] = lit;
  }
  return out;
}
function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('@/') && !spec.startsWith('.')) return null;
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : resolve(dirname(from), spec);
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(base + ext)) return base + ext;
  return null;
}

const ALL = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))];

/** In one file: how many picture elements carry a style, and each one that wears a lit style. */
function picturesIn(src: string, objs: Record<string, Set<string>>): { pictures: number; hits: string[] } {
  const hits: string[] = [];
  let pictures = 0;
  // Any element whose name says it draws a picture.
  for (const m of src.matchAll(/<(\w*Image\w*)\b((?:[^>]|=>)*?)\/?>/g)) {
    const style = /style=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/.exec(m[2]);
    if (!style) continue;
    pictures++;
    for (const ref of style[1].matchAll(/\b(\w+)\.(\w+)\b/g)) {
      if (objs[ref[1]]?.has(ref[2])) {
        hits.push(`${src.slice(0, m.index).split('\n').length} <${m[1]}> wears ${ref[1]}.${ref[2]}`);
      }
    }
  }
  return { pictures, hits };
}

describe('a photograph is not a lit surface', () => {
  const hits: string[] = [];
  let pictures = 0;
  let litStyles = 0;
  for (const f of ALL) {
    const src = read(f);
    const own = litSheets(src);
    for (const sheet of Object.values(own)) litStyles += sheet.size;
    const objs = { ...own };
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const mod = resolveImport(f, m[2]);
      if (!mod) continue;
      const remote = litSheets(read(mod));
      for (const part of m[1].split(',')) {
        const [orig, alias] = part.trim().split(/\s+as\s+/);
        if (remote[orig]) objs[alias || orig] = remote[orig];
      }
    }
    const found = picturesIn(src, objs);
    pictures += found.pictures;
    for (const h of found.hits) hits.push(`${relative(ROOT, f).split('\\').join('/')}:${h}`);
  }

  it('finds the pictures (a scan that finds none proves nothing)', () => {
    expect(pictures).toBeGreaterThan(60);
  });

  it('finds the lit surfaces too — the half that decides what a picture may not wear', () => {
    expect(litStyles).toBeGreaterThan(80);
  });

  it('the detector sees the edge light wherever a style spreads it, and on a picture that wears it', () => {
    const sheet = "const s = StyleSheet.create({ frame: { ...EDGE_LIT, width: 92 }, poster: { width: 92, ...EDGE_LIT }, plain: { width: 1 } });";
    expect([...litSheets(sheet).s].sort()).toEqual(['frame', 'poster']);
    expect(picturesIn(`${sheet}\n<Image source={p} style={[s.poster, { height: 138 }]} />`, litSheets(sheet)).hits)
      .toEqual(['2 <Image> wears s.poster']);
    expect(picturesIn(`${sheet}\n<Image source={p} style={s.plain} />`, litSheets(sheet)).hits).toEqual([]);
  });

  it('draws no picture in a style that spreads the edge light', () => {
    expect(hits).toEqual([]);
  });
});
