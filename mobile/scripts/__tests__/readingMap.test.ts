/**
 * readingMap.test.ts — every file git tracks has an area of the deep pass or a written reason it is left out
 * (scripts/reading-areas.cjs, decided by scripts/reading-map.cjs), and the map's changed parts are git's own.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
type Decided = { path: string; area?: string; by?: string; excluded?: string };
type Rule = { area?: string; re?: RegExp; why?: string; applied?: boolean; unless?: RegExp };
const rm = require('../reading-map.cjs') as {
  trackedFiles: (repo: string) => string[];
  decideAll: (files: string[], o?: { repo?: string; rules?: unknown; readImports?: boolean }) => Decided[];
  parseDiff: (text: string, linesOf: (f: string) => number) => Map<string, number[][]>;
  merge: (r: number[][]) => number[][];
  lineCount: (t: string) => number;
};
const rules = require('../reading-areas.cjs') as { AREAS: { id: string }[]; EXCLUDED: Rule[]; PLACES: Rule[]; NAMES: Rule[]; FALLBACK: Rule[]; SHARED_FOLDERS: RegExp; words: (s: string) => string };

const files = rm.trackedFiles(ROOT);
const decided = rm.decideAll(files, { repo: ROOT });

describe('the reading map', () => {
  it('found the repo, rather than an empty list that has no file without an area', () => {
    expect(files.length).toBeGreaterThan(3000);
    expect(decided.filter((d) => d.area).length).toBeGreaterThan(2000);
    expect(files).toEqual(expect.arrayContaining(['api/og.js', 'vercel.json', '.github/workflows/god_tier_ci.yml', 'supabase/functions/tmdb-proxy/index.ts', 'email-templates/reset-password.html']));
  });

  it('refuses any file with neither an area nor a written reason', () => {
    expect(decided.filter((d) => !d.area && !d.excluded).map((d) => d.path)).toEqual([]);
  });

  it('refuses a file planted where no rule reaches: a new top folder, a new file at the top, a new route folder', () => {
    const planted = ['mobile/brand-new/thing.ts', 'brand-new.cjs', 'mobile/app/newplace/[id].tsx'];
    const out = rm.decideAll([...files, ...planted], { repo: ROOT });
    expect(out.filter((d) => !d.area && !d.excluded).map((d) => d.path)).toEqual(planted);
  });

  it('takes in everything that ships, runs or deploys outside the app folder', () => {
    const area = (p: string) => decided.find((d) => d.path === p)?.area;
    expect(['api/og.js', 'api/proxy-image.ts', 'vercel.json', 'supabase/functions/sync-films/index.ts'].map(area)).toEqual(Array(4).fill('AREA-SHARED'));
    expect(['.github/workflows/ci.yml', '.github/dependabot.yml', 'supabase/email_templates/welcome.html', 'mobile/patches/expo-image+57.0.5.patch', 'mobile/app.json', 'mobile/modules/room-cover/ios/RoomCoverModule.swift'].map(area)).toEqual(Array(6).fill('AREA-MACH'));
  });

  it('leaves out exactly the migrations APPLIED.txt names, read through the live schema, and keeps the pending ones', () => {
    const names = new Set(readFileSync(join(ROOT, 'mobile', 'supabase', 'APPLIED.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
    const migrations = decided.filter((d) => /^(mobile\/)?supabase\/migrations\/[^/]+\.sql$/.test(d.path));
    const asApplied = migrations.filter((d) => /live schema/.test(d.excluded ?? '')).map((d) => d.path.split('/').pop());
    expect(asApplied.length).toBeGreaterThan(200);
    expect(asApplied.filter((n) => !names.has(n ?? ''))).toEqual([]);
    expect(migrations.filter((d) => names.has(d.path.split('/').pop() ?? '') && !/live schema/.test(d.excluded ?? '')).map((d) => d.path)).toEqual([]);
    const applied = decided.find((d) => d.path === 'supabase/migrations/0001_baseline_schema.sql');
    expect(applied?.excluded).toMatch(/live schema/);
    const pending = decided.filter((d) => /^mobile\/supabase\/migrations\/[^/]+\.sql$/.test(d.path) && d.area);
    expect(pending.length).toBeGreaterThan(0);
    expect(new Set(pending.map((d) => d.area))).toEqual(new Set(['AREA-SHARED']));
  });

  it('gives every area files, and every rule a file it decides, so no rule outlives its folder', () => {
    expect(rules.AREAS.filter((a) => !decided.some((d) => d.area === a.id)).map((a) => a.id)).toEqual([]);
    const never = /$^/;
    const nameOf = (f: string) => rules.words((f.split('/').pop() ?? '').replace(/\.(test|spec)\.[cm]?[jt]sx?$/, '').replace(/\.[^.]+$/, ''));
    const dead = [
      ...rules.EXCLUDED.filter((x) => !x.applied && !files.some((f) => (x.re ?? never).test(f) && !(x.unless && x.unless.test(f)))).map((x) => x.why),
      ...rules.PLACES.filter((p) => !files.some((f) => (p.re ?? never).test(f))).map((p) => String(p.re)),
      ...rules.NAMES.filter((n) => !files.some((f) => rules.SHARED_FOLDERS.test(f) && (n.re ?? never).test(nameOf(f)))).map((n) => String(n.re)),
    ];
    expect(dead).toEqual([]);
    expect(rules.EXCLUDED.filter((x) => !x.why || x.why.length < 20)).toEqual([]);
  });

  it('decides a name by its words, so a word inside another never decides', () => {
    expect(rules.words('airplaneModeIsAndroidsAlone.guard')).toBe('airplane mode is androids alone guard');
    const named = (p: string) => decided.find((d) => d.path === p);
    expect(named('mobile/src/utils/__tests__/airplaneModeIsAndroidsAlone.guard.test.ts')?.area).not.toBe('AREA-5');
    expect(named('mobile/src/services/LoungeService.ts')?.area).toBe('AREA-5');
  });
});

describe("the changed parts, from git's own diff", () => {
  it('reads each hunk as its new lines, and a pure deletion as the lines either side', () => {
    const diff = ['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -3,0 +4,2 @@', '+a', '+b', '@@ -10 +12 @@', '-c', '+d', '@@ -20,2 +21,0 @@', '-e', '-f'].join('\n');
    expect(rm.parseDiff(diff, () => 40).get('x.ts')).toEqual([[4, 5], [12, 12], [21, 22]]);
  });
  it('counts lines as the Read tool numbers them, and joins ranges that touch', () => {
    expect([rm.lineCount('a\nb\n'), rm.lineCount('a\nb'), rm.lineCount('')]).toEqual([2, 2, 0]);
    expect(rm.merge([[5, 6], [1, 2], [3, 3], [9, 9]])).toEqual([[1, 3], [5, 6], [9, 9]]);
  });
});
