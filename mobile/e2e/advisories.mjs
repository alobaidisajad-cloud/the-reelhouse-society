#!/usr/bin/env node
/**
 * advisories.mjs — known-vulnerable packages. Those that reach the phone fail
 * the run; the rest are listed.
 *
 *   node e2e/advisories.mjs phone-modules <out file>
 *       Makes the production bundles (iOS and Android, with the production
 *       build's public env from eas.json, as bundle-size.js does) with source
 *       maps, and writes the package folders their modules come from
 *       ("node_modules/a", "node_modules/a/node_modules/b"). Hermes is left out:
 *       it changes the bytes, not which modules are in them.
 *
 *   node e2e/advisories.mjs functions <out file> [--offline] [--roots <dir,dir>]
 *       Every https://esm.sh and npm: import in the two edge-function trees,
 *       each with its exact version: the one it pins, or the one https://esm.sh
 *       resolves it to
 *       today. Then the OSV database is asked about each. --offline lists the
 *       imports and asks nothing (the tests' way).
 *
 *   node e2e/advisories.mjs judge --phone <module list> --app <npm audit json>
 *       [--website <npm audit json>] [--functions <functions report>]
 *       [--allowlist <file>] [--app-lock <file>] [--website-lock <file>]
 *       An advisory on a package folder the phone bundles hold fails the run
 *       unless advisories-allowlist.json holds it (package, version, advisory id)
 *       with its reason; so does one on an edge function's import. Every other
 *       advisory on the app's packages (dev and build tools) is listed, and so is
 *       every advisory on the website's, without failing. An allowlist entry that
 *       matches nothing fails the run too, so a fixed package leaves no excuse
 *       behind. The functions' entries are judged only when --functions is given.
 *
 * The app and the website are read with `npm audit --package-lock-only --json`:
 * it reads the lockfile itself, so it sees each copy of a package at its own
 * folder, which is what the bundle's module list names; OSV would need that
 * tree rebuilt by hand. The functions' imports are in no lockfile, so OSV is
 * asked about them directly.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..');
const ROOT = join(MOBILE, '..');
const ALLOWLIST = join(HERE, 'advisories-allowlist.json');
const PLATFORMS = ['ios', 'android'];

// ── the phone's packages ──────────────────────────────────────────────────────

const FOLDER = /(?:^|\/)(node_modules\/(?:(?:@[^/]+\/)?[^/]+\/node_modules\/)*(?:@[^/]+\/)?[^/]+)\//;

/** The package folders a source map's modules come from, sorted. */
export function packageFolders(sources) {
  const folders = new Set();
  for (const s of sources) {
    const m = FOLDER.exec(String(s).replace(/\\/g, '/'));
    if (m) folders.add(m[1]);
  }
  return [...folders].sort();
}

function phoneModules(out) {
  const dir = mkdtempSync(join(tmpdir(), 'phone-modules-'));
  const env = { ...process.env, ...JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8')).build.production.env };
  const byPlatform = {};
  // One platform at a time: two source-mapped bundles at once can run a small
  // machine out of memory.
  for (const p of PLATFORMS) {
    const args = ['expo', 'export', '--output-dir', join(dir, p), '--source-maps', '--no-bytecode', '--platform', p];
    const r = spawnSync('npx', args, { cwd: MOBILE, env, encoding: 'utf8', maxBuffer: 1e9, shell: process.platform === 'win32' });
    if (r.status !== 0) {
      process.stderr.write(`${r.stdout}${r.stderr}`);
      throw new Error(`expo export failed for ${p}`);
    }
    const js = join(dir, p, '_expo', 'static', 'js', p);
    const maps = readdirSync(js).filter((f) => f.endsWith('.map'));
    if (maps.length !== 1) throw new Error(`${p}: expected one source map, found ${maps.length}`);
    byPlatform[p] = packageFolders(JSON.parse(readFileSync(join(js, maps[0]), 'utf8')).sources);
    if (!byPlatform[p].includes('node_modules/react-native')) throw new Error(`${p}: the source map names no react-native: not the app's bundle`);
  }
  rmSync(dir, { recursive: true, force: true });
  writeFileSync(out, `${JSON.stringify(byPlatform, null, 1)}\n`);
  for (const p of PLATFORMS) console.log(`${p}: ${byPlatform[p].length} package folders`);
}

// ── npm audit ─────────────────────────────────────────────────────────────────

const semver = createRequire(join(MOBILE, 'package.json'))('semver');

/**
 * Each advisory npm audit reports on a package itself (not one it only inherits
 * from a dependency), once per folder whose version it covers. Null when the
 * report is not one.
 */
export function advisoriesOf(audit, lock) {
  if (audit?.auditReportVersion !== 2 || typeof audit.vulnerabilities !== 'object') return null;
  const out = [];
  for (const v of Object.values(audit.vulnerabilities)) {
    for (const via of v.via.filter((x) => typeof x === 'object')) {
      const advisory = String(via.url ?? '').split('/').pop() || String(via.source);
      for (const folder of v.nodes) {
        const pkg = lock.packages?.[folder];
        if (!pkg?.version || !semver.satisfies(pkg.version, via.range, { includePrerelease: true })) continue;
        out.push({ package: v.name, version: pkg.version, advisory, severity: via.severity, folder, dev: !!pkg.dev });
      }
    }
  }
  return out;
}

/** One line per package and version: the advisories on it, and where it sits. */
const listed = (findings, label) => {
  const groups = new Map();
  for (const f of findings) {
    const key = `${f.package} ${f.version}`;
    const g = groups.get(key) ?? { advisories: new Set(), label: label(f) };
    g.advisories.add(`${f.advisory} (${f.severity})`);
    groups.set(key, g);
  }
  return [...groups.keys()].sort().map((k) => `  ${k}${groups.get(k).label}: ${[...groups.get(k).advisories].sort().join(', ')}`);
};

// ── the edge functions' imports ───────────────────────────────────────────────

const ESM = /^https:\/\/esm\.sh\/(?:v\d+\/|stable\/)?((?:@[^/@?#]+\/)?[^/@?#]+)(?:@([^/?#]+))?/;
const NPM = /^npm:((?:@[^/@]+\/)?[^/@]+)(?:@([^/]+))?/;
const EXACT = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

const DENO_CODE = /\.(ts|tsx|js|mjs|jsx)$/;

/** Every file under a folder it is given (--roots), with the code extensions Deno reads. */
const codeFiles = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []).flatMap((d) => (d.isDirectory()
  ? codeFiles(join(dir, d.name)) : DENO_CODE.test(d.name) ? [join(dir, d.name)] : []));

/** The edge functions' code, in both trees, as the shared file list names it. */
const edgeFiles = () => createRequire(import.meta.url)('../test-utils/universe.js').files('functions')
  .filter((f) => DENO_CODE.test(f) && !f.endsWith('.d.ts'));

/** Each package these files import from https://esm.sh or npm:, with the range each file asks for. */
export function importsOf(files, base = ROOT) {
  const found = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      const parsed = ESM.exec(spec) ?? NPM.exec(spec);
      if (!parsed) continue;
      const key = `${parsed[1]}@${parsed[2] ?? ''}`;
      const entry = found.get(key) ?? { name: parsed[1], range: parsed[2] ?? null, pinned: EXACT.test(parsed[2] ?? ''), files: [] };
      const where = relative(base, file).replace(/\\/g, '/');
      if (!entry.files.includes(where)) entry.files.push(where);
      found.set(key, entry);
    }
  }
  return [...found.values()].sort((a, b) => `${a.name}@${a.range}`.localeCompare(`${b.name}@${b.range}`));
}

/** The exact version https://esm.sh serves for a name and range today. */
async function resolve(name, range) {
  const r = await fetch(`https://esm.sh/${name}@${range ?? 'latest'}`);
  if (!r.ok) throw new Error(`esm.sh answered ${r.status} for ${name}@${range ?? 'latest'}`);
  const path = r.headers.get('x-esm-path') ?? '';
  const body = await r.text();
  const exact = new RegExp(`^/${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}@([^/]+)/`).exec(path)?.[1]
    ?? /\/\* esm\.sh - (?:@[^/]+\/)?[^@]+@(\S+) \*\//.exec(body)?.[1];
  if (!exact || !EXACT.test(exact)) throw new Error(`esm.sh named no exact version for ${name}@${range ?? 'latest'}`);
  return exact;
}

async function functions(out, { offline, roots }) {
  const imports = importsOf(roots ? roots.flatMap(codeFiles) : edgeFiles());
  for (const i of imports) i.version = i.pinned ? i.range : offline ? null : await resolve(i.name, i.range);
  if (!offline) {
    const queries = imports.map((i) => ({ package: { name: i.name, ecosystem: 'npm' }, version: i.version }));
    const r = await fetch('https://api.osv.dev/v1/querybatch', { method: 'POST', body: JSON.stringify({ queries }) });
    if (!r.ok) throw new Error(`OSV answered ${r.status}`);
    const { results } = await r.json();
    if (!Array.isArray(results) || results.length !== imports.length) throw new Error('OSV answered for a different number of packages than were asked');
    imports.forEach((i, n) => { i.advisories = (results[n].vulns ?? []).map((v) => v.id).sort(); });
  }
  writeFileSync(out, `${JSON.stringify({ imports }, null, 1)}\n`);
  for (const i of imports) {
    console.log(`${i.name}@${i.range ?? '(no version)'} → ${i.version ?? '(not resolved)'}${i.pinned ? '' : ' (unpinned: resolved today)'}`
      + `${i.advisories ? `: ${i.advisories.length ? i.advisories.join(', ') : 'no advisories'}` : ''}`);
  }
}

// ── the verdict ───────────────────────────────────────────────────────────────

/** What is wrong with the allowlist itself; an empty list when nothing is. */
export function checkAllowlist(list) {
  const problems = [];
  for (const side of ['phone', 'functions']) {
    if (!Array.isArray(list?.[side])) { problems.push(`the allowlist needs a "${side}" list`); continue; }
    const seen = new Set();
    for (const e of list[side]) {
      const key = `${e?.package}@${e?.version} ${e?.advisory}`;
      if (typeof e?.package !== 'string' || !EXACT.test(e?.version ?? '') || typeof e?.advisory !== 'string') {
        problems.push(`${side}: an entry names a package, its exact version and an advisory id: ${JSON.stringify(e)}`);
      } else if (typeof e.reason !== 'string' || !e.reason.trim()) problems.push(`${side}: ${key} gives no reason`);
      if (seen.has(key)) problems.push(`${side}: ${key} is listed twice`);
      seen.add(key);
    }
  }
  return problems;
}

const held = (entries, f) => entries.find((e) => e.package === f.package && e.version === f.version && e.advisory === f.advisory);

/** The verdict in words: the lines to print, and each problem. */
export function judge({ phone, app, website, functionsReport, list }) {
  const lines = [];
  const problems = [];
  const onPhone = new Set(Object.values(phone).flat());
  const phoneFindings = app.filter((f) => onPhone.has(f.folder));
  const others = app.filter((f) => !onPhone.has(f.folder));

  const used = new Set();
  const refusedPhone = [];
  for (const f of phoneFindings) {
    const e = held(list.phone, f);
    if (e) used.add(e); else refusedPhone.push(f);
  }
  lines.push(`On the phone: ${phoneFindings.length} advisor${phoneFindings.length === 1 ? 'y' : 'ies'}, ${phoneFindings.length - refusedPhone.length} on the allowlist`);
  lines.push(...listed(phoneFindings, (f) => (held(list.phone, f) ? '' : ' [NOT ON THE ALLOWLIST]')));
  for (const f of refusedPhone) problems.push(`${f.package} ${f.version} reaches the phone (${f.folder}) with ${f.advisory}, and the allowlist does not hold it`);
  for (const e of list.phone.filter((x) => !used.has(x))) problems.push(`the phone allowlist holds ${e.package} ${e.version} ${e.advisory}, which no longer reaches the phone with it`);

  lines.push('', `The app's dev and build tools (listed, never failing): ${others.length} advisor${others.length === 1 ? 'y' : 'ies'}`);
  lines.push(...listed(others, (f) => (f.dev ? ' (dev)' : ' (build)')));

  if (website) {
    lines.push('', `The website (listed, never failing): ${website.length} advisor${website.length === 1 ? 'y' : 'ies'}`);
    lines.push(...listed(website, () => ''));
  }

  if (functionsReport) {
    const findings = functionsReport.imports.flatMap((i) => (i.advisories ?? []).map((advisory) => ({ package: i.name, version: i.version, advisory, files: i.files })));
    const usedFn = new Set();
    lines.push('', `The edge functions' imports: ${functionsReport.imports.length}, with ${findings.length} advisor${findings.length === 1 ? 'y' : 'ies'}`);
    for (const i of functionsReport.imports) {
      lines.push(`  ${i.name}@${i.range ?? ''} → ${i.version}${i.pinned ? '' : ' (unpinned: resolved today)'}: ${i.advisories?.length ? i.advisories.join(', ') : 'none'}`);
      if (!Array.isArray(i.advisories)) problems.push(`${i.name}@${i.version} was never asked of the OSV database`);
    }
    for (const f of findings) {
      const e = held(list.functions, f);
      if (e) usedFn.add(e); else problems.push(`an edge function imports ${f.package} ${f.version} (${f.files.join(', ')}) with ${f.advisory}, and the allowlist does not hold it`);
    }
    for (const e of list.functions.filter((x) => !usedFn.has(x))) problems.push(`the functions allowlist holds ${e.package} ${e.version} ${e.advisory}, which no import has any more`);
  }
  return { lines, problems };
}

const readJson = (file, what) => {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${what} (${file}) cannot be read: ${e.message}`); }
};

/** An npm audit report's advisories, or a failure naming what went wrong. */
const audited = (file, lockFile, what) => {
  const report = readJson(file, what);
  const found = advisoriesOf(report, readJson(lockFile, `${what}'s lockfile`));
  if (!found) throw new Error(`${what} is not an npm audit report${report?.error?.summary ? `: ${report.error.summary}` : ''}`);
  return found;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? null : args.splice(at, 2)[1];
  };
  const has = (name) => {
    const at = args.indexOf(name);
    if (at !== -1) args.splice(at, 1);
    return at !== -1;
  };
  const usage = () => {
    console.error('usage: node e2e/advisories.mjs phone-modules <out.json>\n'
      + '       node e2e/advisories.mjs functions <out.json> [--offline] [--roots <dir,dir>]\n'
      + '       node e2e/advisories.mjs judge --phone <modules.json> --app <audit.json> [--website <audit.json>]'
      + ' [--functions <functions.json>] [--allowlist <file>] [--app-lock <file>] [--website-lock <file>]');
    process.exit(2);
  };
  const command = args.shift();
  try {
    if (command === 'phone-modules') {
      if (args.length !== 1) usage();
      phoneModules(args[0]);
    } else if (command === 'functions') {
      const offline = has('--offline');
      const roots = flag('--roots')?.split(',');
      if (args.length !== 1) usage();
      await functions(args[0], { offline, roots });
    } else if (command === 'judge') {
      const phoneFile = flag('--phone');
      const appFile = flag('--app');
      const websiteFile = flag('--website');
      const functionsFile = flag('--functions');
      const listFile = flag('--allowlist') ?? ALLOWLIST;
      const appLock = flag('--app-lock') ?? join(MOBILE, 'package-lock.json');
      const websiteLock = flag('--website-lock') ?? join(ROOT, 'package-lock.json');
      if (args.length || !phoneFile || !appFile) usage();
      const list = readJson(listFile, 'the allowlist');
      const listProblems = checkAllowlist(list);
      if (listProblems.length) throw new Error(listProblems.join(' / '));
      const phone = readJson(phoneFile, 'the phone module list');
      if (PLATFORMS.some((p) => !Array.isArray(phone[p]) || !phone[p].length)) throw new Error('the phone module list names no package folders for iOS and Android');
      const { lines, problems } = judge({
        phone,
        app: audited(appFile, appLock, "the app's audit"),
        website: websiteFile ? audited(websiteFile, websiteLock, "the website's audit") : null,
        functionsReport: functionsFile ? readJson(functionsFile, "the functions' report") : null,
        list,
      });
      console.log(lines.join('\n'));
      for (const p of problems) console.log(`✗ ${p}`);
      process.exit(problems.length ? 1 : 0);
    } else usage();
  } catch (e) {
    console.log(`✗ ${e.message}`);
    process.exit(1);
  }
}
