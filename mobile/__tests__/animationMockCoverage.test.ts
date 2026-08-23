/**
 * animationMockCoverage.test.ts — the harness must not decide which components
 * are testable.
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────────
 * The reanimated mock listed its entering/exiting builders by hand. `FadeInRight`
 * was not on the list, so every component using it threw
 *
 *     TypeError: Cannot read properties of undefined (reading 'delay')
 *
 * the instant a test rendered it. CinematicInsights had been in the app for
 * months with no render test, and this is why: the failure looks like a broken
 * component, so the natural response is to delete the test rather than fix the
 * harness. A hand-written list is default-DENY everywhere nobody looked.
 *
 * So the list is generated now, and this is the guard: every animation builder
 * the app ACTUALLY uses must be chainable in the mock. It re-derives the set
 * from source on every run, which means a component adopting a new builder
 * either works or fails here — never silently in the place that would have
 * caught a real bug.
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
 * Every builder named in an `entering` / `exiting` / `layout` prop.
 *
 * Deliberately reads the PROP, not the import: an import can be present and
 * unused, and an unused builder cannot break a render. What breaks a render is
 * a builder that is reached for while the mock has nothing under that name.
 */
function buildersUsed(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of walk(join(ROOT, 'src')).concat(walk(join(ROOT, 'app')))) {
    const src = readFileSync(file, 'utf8');
    const re = /\b(?:entering|exiting|layout)\s*=\s*\{\s*([A-Z]\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
      const at = used.get(m[1]) ?? [];
      if (!at.includes(rel)) at.push(rel);
      used.set(m[1], at);
    }
  }
  return used;
}

describe('every animation the app uses can be rendered by a test', () => {
  // In jest this resolves to the mock in jest.setup.ts — which is the point.
  const mock = require('react-native-reanimated');
  const used = buildersUsed();

  it('finds the builders by reading the app, not a list kept by hand', () => {
    // If this ever reads zero, the regex broke and every assertion below became
    // vacuous — the failure mode this whole file exists to prevent.
    expect(used.size).toBeGreaterThan(5);
  });

  it('covers FadeInRight, the one that was missing', () => {
    // Pinned by name because it is the case that proved the list was wrong.
    expect(mock.FadeInRight).toBeDefined();
    expect(typeof mock.FadeInRight.delay).toBe('function');
  });

  it.each([...buildersUsed().keys()].sort())('%s is chainable in the mock', (name) => {
    const builder = (mock as Record<string, any>)[name];
    expect(builder).toBeDefined();
    // The real builders return themselves from every modifier, so they compose
    // in any order and any number. `.delay(80).duration(400)` is the shape the
    // app actually writes, and the shape that threw.
    expect(builder.delay(80).duration(400).springify()).toBeDefined();
  });
});
