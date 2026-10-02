/**
 * aComponentHasOneName.guard.test.ts — no two modules export a component
 * under the same name.
 *
 * Two SectionCards, two SectionHeads, two ProjectorBeams, two BrassSheens and
 * two CritiqueRows each looked like one thing in an import and drew another:
 * the Edit Profile desk's card is not Settings', the Reel's beam is not the
 * Lobby's, the Dispatch paper's critique row is not the one logs and stacks
 * share. A sweep by name was fooled by exactly this once (a dead ReportSheet
 * vouched for by the live one), so a name is now one thing.
 *
 * Why source: which module exports a name is a fact about the code, not
 * something a render shows.
 */
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { readCode, MOBILE } from '@/test-utils/readCode';

const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) files.push(p);
  }
};
walk(join(MOBILE, 'src'));
walk(join(MOBILE, 'app'));

/** A component's name: Capital then lower case (constants are written ALL CAPS, and may repeat). */
const EXPORTED = /export\s+(?:default\s+)?(?:const|function|class)\s+([A-Z][a-z][A-Za-z0-9]*)/g;

const byName = new Map<string, string[]>();
for (const f of files) {
  for (const m of readCode(f).matchAll(EXPORTED)) {
    byName.set(m[1], [...(byName.get(m[1]) ?? []), relative(MOBILE, f).replace(/\\/g, '/')]);
  }
}

it('reads the exports at all — a sweep of nothing proves nothing', () => {
  expect(byName.size).toBeGreaterThan(300);
  expect(byName.get('PaperCritiqueRow')).toEqual(['src/components/dispatch/paper/PaperCritiques.tsx']);
});

it('every exported component name belongs to one module', () => {
  const twice = [...byName].filter(([, where]) => new Set(where).size > 1).map(([name, where]) => `${name} ← ${where.join(' | ')}`);
  expect(twice).toEqual([]);
});
