/**
 * tmdbMockCoverage.test.ts — the second hand-list, found the same way as the first.
 *
 * The reanimated mock listed its animation builders by hand and was missing four
 * the app uses. Ten lines further down, the TMDB mock listed its methods by hand
 * and was missing eight — including `profile()`, the builder that draws the
 * faces in CinematicInsights. Both fail identically: "x is not a function" at
 * render, which reads like a broken component rather than a broken harness, so
 * the test gets abandoned and the component keeps its zero coverage.
 *
 * This re-derives the set from source every run. A component reaching for a new
 * TMDB method now fails HERE, with a message naming the file, instead of
 * somewhere that looked like a product bug.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.|\.d\.ts$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * Members reached through the `tmdb` object, as a CALL.
 *
 * The trailing `(` is what separates a real call from `image.tmdb.org` in a URL
 * and from `@/src/lib/tmdb` in an import — both of which a bare `tmdb\.\w+`
 * sweep picks up, and both of which would make this suite fail on things that
 * are not methods at all.
 */
function methodsCalled(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(join(ROOT, 'src')).concat(walk(join(ROOT, 'app')))) {
    const src = readFileSync(file, 'utf8');
    const re = /(?<!image\.)\btmdb\.([a-zA-Z]\w*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
      const at = found.get(m[1]) ?? [];
      if (!at.includes(rel)) at.push(rel);
      found.set(m[1], at);
    }
  }
  return found;
}

describe('every TMDB method the app calls exists on the test mock', () => {
  // In jest this resolves to the mock in jest.setup.ts — which is the point.
  const { tmdb } = require('@/src/lib/tmdb');
  const called = methodsCalled();

  it('finds the methods by reading the app, not a list kept by hand', () => {
    // A broken regex here would make every assertion below pass having checked
    // nothing — the exact shape of the failure this file exists to prevent.
    expect(called.size).toBeGreaterThan(8);
  });

  it('does not mistake image.tmdb.org or the import path for a method', () => {
    for (const ghost of ['org', 'ts', 'types']) expect(called.has(ghost)).toBe(false);
  });

  it('covers profile(), the one that was missing', () => {
    // Pinned by name: this is the case that proved the list was wrong.
    expect(typeof tmdb.profile).toBe('function');
    expect(tmdb.profile('/face.jpg')).toBe('https://image.tmdb.org/t/p/w185/face.jpg');
    expect(tmdb.profile(null)).toBeUndefined();
  });

  it.each([...methodsCalled().entries()].sort())('%s is callable', (name) => {
    expect(typeof (tmdb as Record<string, unknown>)[name]).toBe('function');
  });

  it('keeps peekDetail synchronous, as the real module has it', () => {
    // It reads a cache; it does not make a request. A promise here would make
    // `tmdb.peekDetail(id)?.title` a truthy object in every test that touches it.
    expect(tmdb.peekDetail(1)).toBeUndefined();
  });

  it('the URL builders return a falsy value for a missing path, never a broken URL', () => {
    // `${IMG}/w185${null}` is a 200-shaped string ending in "null" — an <Image>
    // pointed at it fails silently rather than falling back to the ✦ placeholder.
    for (const b of ['poster', 'backdrop', 'profile', 'logo', 'posterThumb'] as const) {
      expect(tmdb[b](null)).toBeFalsy();
      expect(tmdb[b](undefined)).toBeFalsy();
    }
  });
});
