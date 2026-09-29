/**
 * notificationsMockCoverage.test.ts — the third hand-list, found the same way.
 *
 * jest.setup.ts lists expo-notifications' members by hand, and it had left out
 * four the app calls. The first a test met was `setBadgeCountAsync`, on the
 * Notices screen's mount: "is not a function", which reads as a broken screen
 * rather than a broken harness — so the screen had simply never been mounted
 * by a test. This re-derives the set from source every run (as
 * tmdbMockCoverage does for the catalogue).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.|\.d\.ts$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Members reached through a namespace import of expo-notifications, by the name each file gave it. */
function membersUsed(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of walk(join(ROOT, 'src')).concat(walk(join(ROOT, 'app')))) {
    const src = readFileSync(file, 'utf8');
    // A namespace import, or `Notifications` for the one file that imports it lazily.
    if (!src.includes("'expo-notifications'")) continue;
    const ns = /import \* as (\w+) from 'expo-notifications'/.exec(src)?.[1] ?? 'Notifications';
    const re = new RegExp(`\\b${ns}\\.([A-Za-z]\\w*)`, 'g');
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

it('reads the app — it is not passing on an empty sweep', () => {
  expect(membersUsed().size).toBeGreaterThan(5);
});

it('every expo-notifications member the app uses exists on the test mock', () => {
  const mock = jest.requireMock('expo-notifications') as Record<string, unknown>;
  const missing = [...membersUsed()].filter(([name]) => !(name in mock)).map(([name, files]) => `${name} (${files.join(', ')})`);
  expect(missing).toEqual([]);
});
