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

/** Style names that spread EDGE_LIT, per StyleSheet.create object in a file. */
function litSheets(src: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const m of src.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*StyleSheet\.create\(\{/g)) {
    const start = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}') { depth--; if (!depth) break; }
    }
    out[m[1]] = new Set([...src.slice(start, end).matchAll(/(\b\w+)\s*:\s*\{\s*\.\.\.EDGE_LIT\b/g)].map((x) => x[1]));
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

describe('a photograph is not a lit surface', () => {
  const hits: string[] = [];
  let pictures = 0;
  for (const f of ALL) {
    const src = read(f);
    const objs = { ...litSheets(src) };
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const mod = resolveImport(f, m[2]);
      if (!mod) continue;
      const remote = litSheets(read(mod));
      for (const part of m[1].split(',')) {
        const [orig, alias] = part.trim().split(/\s+as\s+/);
        if (remote[orig]) objs[alias || orig] = remote[orig];
      }
    }
    // Any element whose name says it draws a picture.
    for (const m of src.matchAll(/<(\w*Image\w*)\b((?:[^>]|=>)*?)\/?>/g)) {
      const style = /style=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/.exec(m[2]);
      if (!style) continue;
      pictures++;
      for (const ref of style[1].matchAll(/\b(\w+)\.(\w+)\b/g)) {
        if (objs[ref[1]]?.has(ref[2])) {
          const line = src.slice(0, m.index).split('\n').length;
          hits.push(`${relative(ROOT, f).split('\\').join('/')}:${line} <${m[1]}> wears ${ref[1]}.${ref[2]}`);
        }
      }
    }
  }

  it('finds the pictures (a scan that finds none proves nothing)', () => {
    expect(pictures).toBeGreaterThan(60);
  });

  it('draws no picture in a style that spreads the edge light', () => {
    expect(hits).toEqual([]);
  });
});
