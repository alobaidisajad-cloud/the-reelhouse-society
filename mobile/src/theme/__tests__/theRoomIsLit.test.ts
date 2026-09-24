/**
 * THE ROOM IS LIT — the enumeration, as a test.
 * ──────────────────────────────────────────────────────────────────────────
 * The light is painted once, at a screen's root, under everything (see
 * RoomLight). A screen whose root is painted in the house colour and does not
 * carry it is a dark room in a lit house — and nothing else would ever say
 * so: it renders, it passes every other test, and it is simply flat.
 *
 * Two laws, each read from the source:
 *
 *   1. Every SCREEN ROOT painted in the house colour — the element a
 *      component returns, wearing a style with `flex: 1` and
 *      `backgroundColor: colors.ink` — has the light as its FIRST child:
 *      `<RoomLight>`, or `<AuthBackdrop>`, which carries it.
 *
 *   2. Every ROUTE draws the light: in its own file, or in a component it
 *      renders or re-exports. (Law 1 already makes every house-coloured
 *      root carry it; this catches a route with no root of its own.)
 *
 * A screen may be exempt only by being named below with what it really is.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

/** Roots that are not rooms. */
const NOT_A_ROOM: Record<string, string> = {
  'app/_layout.tsx · root': 'the app’s own frame: every screen paints its ground over it',
  'src/components/feed/AutopsyView.tsx · backRoot': 'the back face of a card, not a screen',
};

/** Routes that are not rooms. */
const NOT_A_ROOM_ROUTE: Record<string, string> = {
  'app/lounge.tsx': 'a redirect to the Lounge tab — it draws nothing',
  'app/(modals)/search-modal.tsx': 'a see-through overlay: the lit screen behind it shows through',
  'app/(modals)/list-modal.tsx': 'a sheet in the CARD colour — a surface on the light, not a room',
  'app/(modals)/log-modal.tsx': 'a sheet in the CARD colour — a surface on the light, not a room',
};

const LIT = /^<(RoomLight|AuthBackdrop)\b/;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(ROOT, p).split('\\').join('/');
const read = (p: string) => readFileSync(p, 'utf8');
/** Comments out, so a sentence about `flex: 1` is not a style. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Names of house-coloured SCREEN styles in each StyleSheet.create object of a file. */
function sheets(src: string): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  const clean = code(src);
  for (const m of clean.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*StyleSheet\.create\(\{/g)) {
    const start = (m.index ?? 0) + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (; end < clean.length; end++) {
      if (clean[end] === '{') depth++;
      else if (clean[end] === '}') { depth--; if (!depth) break; }
    }
    const names = new Set<string>();
    for (const s of clean.slice(start + 1, end).matchAll(/(\b[A-Za-z_]\w*)\s*:\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
      if (/\bflex\s*:\s*1\b/.test(s[2]) && /backgroundColor\s*:\s*colors\.ink\b/.test(s[2])) names.add(s[1]);
    }
    out[m[1]] = names;
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('@/') && !spec.startsWith('.')) return null;
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : resolve(dirname(from), spec);
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) if (existsSync(base + ext)) return base + ext;
  return null;
}

/** The style objects a file can name: its own, and the ones it imports. */
function styleObjects(file: string, src: string): Record<string, Set<string>> {
  const objs = { ...sheets(src) };
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const mod = resolveImport(file, m[2]);
    if (!mod) continue;
    const remote = sheets(read(mod));
    for (const part of m[1].split(',')) {
      const [orig, alias] = part.trim().split(/\s+as\s+/);
      if (remote[orig]) objs[alias || orig] = remote[orig];
    }
  }
  return objs;
}

interface Root { where: string; key: string; lit: boolean }

/**
 * Every element a component RETURNS that is painted as a house-coloured
 * screen — through a named style or an inline one. Wrappers that paint
 * nothing (a fragment, `<FrozenTab>`: no props at all) are looked through.
 */
function houseRoots(file: string): Root[] {
  const src = code(read(file));
  const objs = styleObjects(file, read(file));
  const out: Root[] = [];
  const re = /return\s*\(?\s*(?:(?:<[A-Z]?[\w.]*>|\{\s*\})\s*)*<([A-Z][\w.]*)\b((?:[^>]|=>)*?)(\/?)>/g;
  for (const m of src.matchAll(re)) {
    const named = /style=\{\s*\[?\s*(\w+)\.(\w+)\b/.exec(m[2]);
    const inline = /style=\{\{([^}]*)\}\}/.exec(m[2]);
    let name: string | null = null;
    if (named && objs[named[1]]?.has(named[2])) name = named[2];
    else if (inline && /\bflex\s*:\s*1\b/.test(inline[1]) && /backgroundColor\s*:\s*colors\.ink\b/.test(inline[1])) name = '(inline)';
    if (!name) continue;
    const at = (m.index ?? 0) + m[0].length;
    const rest = src.slice(at).replace(/^(\s|\{\s*\})*/, '');
    const line = src.slice(0, m.index).split('\n').length;
    out.push({
      where: `${rel(file)}:${line}`,
      key: `${rel(file)} · ${name}`,
      lit: m[3] !== '/' && LIT.test(rest),
    });
  }
  return out;
}

const ALL = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))];
const ROUTES = files(join(ROOT, 'app')).filter((f) => !/[\\/]_layout\.tsx$/.test(f) && /\.tsx$/.test(f));

describe('the room is lit', () => {
  const roots = ALL.flatMap(houseRoots);

  it('finds the rooms at all (a scan that finds none proves nothing)', () => {
    expect(roots.length).toBeGreaterThan(50);
  });

  it('every house-coloured screen root carries the light as its first child', () => {
    const dark = roots.filter((r) => !r.lit && !NOT_A_ROOM[r.key]).map((r) => r.where);
    expect(dark).toEqual([]);
  });

  it('every route draws the light — in its own file or one it renders', () => {
    const litFiles = new Set(ALL.filter((f) => /<(RoomLight|AuthBackdrop)\b/.test(code(read(f)))).map(rel));
    const dark: string[] = [];
    for (const route of ROUTES) {
      const name = rel(route);
      if (NOT_A_ROOM_ROUTE[name]) continue;
      if (litFiles.has(name)) continue;
      const src = read(route);
      // A component it renders (<Name) or re-exports as the screen.
      const reached = [...src.matchAll(/import\s+(?:(\w+)|\{([^}]*)\})\s*(?:,\s*\{([^}]*)\})?\s*from\s*'([^']+)'/g)].some((m) => {
        const mod = resolveImport(route, m[4]);
        if (!mod || !litFiles.has(rel(mod))) return false;
        const names = [m[1], ...(m[2] ?? '').split(','), ...(m[3] ?? '').split(',')]
          .filter(Boolean).map((n) => n.trim().split(/\s+as\s+/).pop() as string);
        return names.some((n) => new RegExp(`<${n}\\b|export default ${n}\\b`).test(src));
      });
      if (!reached) dark.push(name);
    }
    expect(dark).toEqual([]);
  });

  it('names no exemption that no longer exists', () => {
    const keys = new Set(roots.map((r) => r.key));
    expect(Object.keys(NOT_A_ROOM).filter((k) => !keys.has(k))).toEqual([]);
    expect(Object.keys(NOT_A_ROOM_ROUTE).filter((k) => !ROUTES.map(rel).includes(k))).toEqual([]);
  });
});
