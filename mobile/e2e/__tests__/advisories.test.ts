/**
 * advisories.test.ts — known-vulnerable packages: one that reaches the phone
 * fails the run unless the allowlist holds it, everything else is listed, and
 * each way the list falls behind is shown saying no.
 *
 * advisories.mjs is run as the workflows run it, on files in the shapes they
 * hand it: the phone module list phone-modules writes, `npm audit --json`
 * reports (version 2) with the lockfile they read, and the report the functions
 * step writes. Nothing here reaches the network: the functions step runs with
 * --offline.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'advisories.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'advisories-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const file = (name: string, body: unknown) => {
  writeFileSync(join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  return join(dir, name);
};

// One package on the phone at one folder and in a build tool at another; a dev-only package.
const LOCK = {
  packages: {
    '': { name: 'mobile' },
    'node_modules/nanoid': { version: '3.3.13' },
    'node_modules/postcss/node_modules/nanoid': { version: '3.3.11' },
    'node_modules/form-data': { version: '4.0.5', dev: true },
    'node_modules/markdown-it': { version: '10.0.0' },
  },
};
const via = (name: string, ghsa: string, range: string, severity = 'high') =>
  ({ source: 1, name, dependency: name, title: 't', url: `https://github.com/advisories/${ghsa}`, severity, range });
const AUDIT = {
  auditReportVersion: 2,
  vulnerabilities: {
    nanoid: { name: 'nanoid', via: [via('nanoid', 'GHSA-aaaa-aaaa-aaaa', '<3.3.16')], nodes: ['node_modules/nanoid', 'node_modules/postcss/node_modules/nanoid'] },
    'form-data': { name: 'form-data', via: [via('form-data', 'GHSA-bbbb-bbbb-bbbb', '>=4.0.0 <4.0.6')], nodes: ['node_modules/form-data'] },
    // Its advisory covers versions the lockfile does not hold: not a finding.
    'markdown-it': { name: 'markdown-it', via: [via('markdown-it', 'GHSA-cccc-cccc-cccc', '>=11.0.0')], nodes: ['node_modules/markdown-it'] },
    // Vulnerable only through a dependency: npm names the dependency, not an advisory of its own.
    'expo-router': { name: 'expo-router', via: ['nanoid'], nodes: ['node_modules/expo-router'] },
  },
  metadata: {},
};
const PHONE = { ios: ['node_modules/nanoid', 'node_modules/react-native'], android: ['node_modules/nanoid', 'node_modules/react-native'] };
const HELD = { package: 'nanoid', version: '3.3.13', advisory: 'GHSA-aaaa-aaaa-aaaa', reason: 'called only with its default size' };

function judge(parts: { list?: unknown; audit?: unknown; phone?: unknown; website?: unknown; functions?: unknown } = {}) {
  const args = [SCRIPT, 'judge',
    '--phone', file('phone.json', parts.phone ?? PHONE),
    '--app', file('audit.json', parts.audit ?? AUDIT),
    '--app-lock', file('lock.json', LOCK),
    '--allowlist', file('list.json', parts.list ?? { phone: [HELD], functions: [] })];
  if (parts.website) args.push('--website', file('website.json', parts.website), '--website-lock', file('website-lock.json', LOCK));
  if (parts.functions) args.push('--functions', file('functions.json', parts.functions));
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, problems: r.stdout.split('\n').filter((l) => l.startsWith('✗ ')) };
}

it('passes a phone advisory the allowlist holds, and lists the rest by package, version and advisory without failing', () => {
  const r = judge();
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(r.out).toContain('On the phone: 1 advisory, 1 on the allowlist\n  nanoid 3.3.13: GHSA-aaaa-aaaa-aaaa (high)');
  expect(r.out).toContain("The app's dev and build tools (listed, never failing): 2 advisories");
  expect(r.out).toContain('  form-data 4.0.5 (dev): GHSA-bbbb-bbbb-bbbb (high)');
  expect(r.out).toContain('  nanoid 3.3.11 (build): GHSA-aaaa-aaaa-aaaa (high)');
  expect(r.out).not.toContain('markdown-it');
  expect(r.out).not.toContain('expo-router');
});

it('says no to a phone advisory the allowlist does not hold, naming the package, version, folder and advisory', () => {
  const r = judge({ list: { phone: [], functions: [] } });
  expect(r.code).toBe(1);
  expect(r.out).toContain('  nanoid 3.3.13 [NOT ON THE ALLOWLIST]: GHSA-aaaa-aaaa-aaaa (high)');
  expect(r.problems).toEqual(['✗ nanoid 3.3.13 reaches the phone (node_modules/nanoid) with GHSA-aaaa-aaaa-aaaa, and the allowlist does not hold it']);
});

it('says no to a phone entry that no longer matches: the package left the phone, or moved to another version', () => {
  const gone = judge({ phone: { ios: ['node_modules/react-native'], android: ['node_modules/react-native'] } });
  expect(gone.code).toBe(1);
  expect(gone.problems).toEqual(['✗ the phone allowlist holds nanoid 3.3.13 GHSA-aaaa-aaaa-aaaa, which no longer reaches the phone with it']);
  const moved = judge({ list: { phone: [{ ...HELD, version: '3.3.12' }], functions: [] } });
  expect(moved.problems).toContain('✗ the phone allowlist holds nanoid 3.3.12 GHSA-aaaa-aaaa-aaaa, which no longer reaches the phone with it');
});

it('lists the website\'s advisories and never fails on them', () => {
  const r = judge({ website: AUDIT });
  expect({ code: r.code, problems: r.problems }).toEqual({ code: 0, problems: [] });
  expect(r.out).toContain('The website (listed, never failing): 3 advisories');
});

it('fails on an edge function import with an advisory unless the allowlist holds it, and on an entry no import has', () => {
  const imports = [
    { name: '@supabase/supabase-js', range: '2', pinned: false, version: '2.118.0', files: ['supabase/functions/a/index.ts'], advisories: [] },
    { name: 'left-pad', range: '1.0.0', pinned: true, version: '1.0.0', files: ['mobile/supabase/functions/b/index.ts'], advisories: ['GHSA-dddd-dddd-dddd'] },
  ];
  const refused = judge({ functions: { imports } });
  expect(refused.code).toBe(1);
  expect(refused.out).toContain('  @supabase/supabase-js@2 → 2.118.0 (unpinned: resolved today): none');
  expect(refused.problems).toEqual(['✗ an edge function imports left-pad 1.0.0 (mobile/supabase/functions/b/index.ts) with GHSA-dddd-dddd-dddd, and the allowlist does not hold it']);
  const fnHeld = { package: 'left-pad', version: '1.0.0', advisory: 'GHSA-dddd-dddd-dddd', reason: 'r' };
  expect(judge({ functions: { imports }, list: { phone: [HELD], functions: [fnHeld] } }).code).toBe(0);
  const stale = judge({ functions: { imports: [imports[0]] }, list: { phone: [HELD], functions: [fnHeld] } });
  expect(stale.problems).toEqual(['✗ the functions allowlist holds left-pad 1.0.0 GHSA-dddd-dddd-dddd, which no import has any more']);
  const unasked = judge({ functions: { imports: [{ ...imports[0], advisories: undefined }] } });
  expect(unasked.problems).toEqual(['✗ @supabase/supabase-js@2.118.0 was never asked of the OSV database']);
});

it('fails by name on a report it cannot read, rather than passing on no advisories', () => {
  const offline = judge({ audit: { error: { code: 'ENOTFOUND', summary: 'request to registry failed' } } });
  expect(offline.problems).toEqual(["✗ the app's audit is not an npm audit report: request to registry failed"]);
  expect(judge({ phone: { ios: [] } }).problems).toEqual(['✗ the phone module list names no package folders for iOS and Android']);
  expect(judge({ list: { phone: [{ package: 'nanoid', version: '3.3.13', advisory: 'GHSA-aaaa-aaaa-aaaa' }], functions: [] } }).problems)
    .toEqual(['✗ phone: nanoid@3.3.13 GHSA-aaaa-aaaa-aaaa gives no reason']);
  expect(judge({ list: { phone: [{ ...HELD, version: '^3' }] } }).problems.join()).toContain('the allowlist needs a "functions" list');
});

it('lists every esm.sh and npm: import with the version it pins, and leaves an unpinned one to be resolved', () => {
  mkdirSync(join(dir, 'a', 'fn'), { recursive: true });
  mkdirSync(join(dir, 'b', 'fn'), { recursive: true });
  writeFileSync(join(dir, 'a', 'fn', 'index.ts'), [
    "import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';",
    "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';",
    "import x from \"npm:left-pad@1.3.0\";",
  ].join('\n'));
  writeFileSync(join(dir, 'b', 'fn', 'index.ts'), [
    "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';",
    "const later = await import('https://esm.sh/v135/zod@3.22.4?target=deno');",
  ].join('\n'));
  const out = join(dir, 'functions.json');
  const r = spawnSync(process.execPath, [SCRIPT, 'functions', out, '--offline', '--roots', `${join(dir, 'a')},${join(dir, 'b')}`], { encoding: 'utf8' });
  expect(r.status).toBe(0);
  const { imports } = JSON.parse(readFileSync(out, 'utf8')) as { imports: { name: string; range: string | null; pinned: boolean; version: string | null }[] };
  expect(imports.map(({ name, range, pinned, version }) => ({ name, range, pinned, version }))).toEqual([
    { name: '@supabase/supabase-js', range: '2', pinned: false, version: null },
    { name: '@supabase/supabase-js', range: '2.39.3', pinned: true, version: '2.39.3' },
    { name: 'left-pad', range: '1.3.0', pinned: true, version: '1.3.0' },
    { name: 'zod', range: '3.22.4', pinned: true, version: '3.22.4' },
  ]);
});

it('reads the real functions trees: supabase-js, pinned in one place and unpinned in others', () => {
  const out = join(dir, 'functions.json');
  expect(spawnSync(process.execPath, [SCRIPT, 'functions', out, '--offline'], { encoding: 'utf8' }).status).toBe(0);
  const { imports } = JSON.parse(readFileSync(out, 'utf8')) as { imports: { name: string; pinned: boolean; files: string[] }[] };
  expect(imports.every((i) => i.name === '@supabase/supabase-js')).toBe(true);
  expect(imports.some((i) => i.pinned) && imports.some((i) => !i.pinned)).toBe(true);
  expect(imports.flatMap((i) => i.files)).toEqual(expect.arrayContaining(['mobile/supabase/functions/notify-push/index.ts', 'supabase/functions/send-email/index.ts']));
});

it('names each package folder a bundle\'s source map draws from, nested and scoped ones too', () => {
  const sources = [
    '/node_modules/react-native/Libraries/Core/InitializeCore.js',
    '/node_modules/expo/node_modules/@expo/cli/build/metro-require/require.js',
    '/node_modules/@react-navigation/core/lib/module/index.js',
    'C:\\app\\node_modules\\nanoid\\non-secure\\index.js',
    '/src/app/index.tsx',
    '\u0000polyfill:external-require',
  ];
  const code = `const m = await import(${JSON.stringify(pathToFileURL(SCRIPT).href)}); console.log(JSON.stringify(m.packageFolders(${JSON.stringify(sources)})));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(JSON.parse(r.stdout)).toEqual([
    'node_modules/@react-navigation/core',
    'node_modules/expo/node_modules/@expo/cli',
    'node_modules/nanoid',
    'node_modules/react-native',
  ]);
});

it('the committed allowlist is well formed', () => {
  const list = JSON.parse(readFileSync(join(__dirname, '..', 'advisories-allowlist.json'), 'utf8'));
  const r = judge({ list, audit: { auditReportVersion: 2, vulnerabilities: {} } });
  expect(r.problems.filter((p) => !p.includes('no longer reaches the phone'))).toEqual([]);
  expect(r.problems.length).toBe(list.phone.length);
});

it('refuses to run without what it needs', () => {
  expect(spawnSync(process.execPath, [SCRIPT, 'judge', '--app', 'x.json'], { encoding: 'utf8' }).status).toBe(2);
  expect(spawnSync(process.execPath, [SCRIPT, 'nothing'], { encoding: 'utf8' }).status).toBe(2);
});
