#!/usr/bin/env node
/**
 * verdicts.cjs — a check's last green verdict, taken again only while every byte it read is as it was.
 *
 * A check's inputs are found from the files themselves (inputsOf): from its seeds, every file each one's
 * code names, by any of these, and every file those name, to the end:
 *   - a path from mobile/ or from the root (`e2e/attempt.mjs`, `mobile/e2e/shards.json`);
 *   - a bare file name: in the naming file's own folder (a helper a shell script sources from beside itself),
 *     or the one file of that name the repository holds;
 *   - an import or require, relative (with the extensions node and jest try) or from the app's root (`@/`);
 *   - join(__dirname, ...) and resolve(__dirname, ...), joined.
 * Packages are no file of the repo: their versions are package-lock.json, read with the jest config
 * every test runs under (UNDER), and the node and bash that run it (toolsNow).
 *
 * A verdict is kept only when green, with each input's sha256, in the repository's git folder
 * (rh-verdicts/, never tracked, one per clone, shared by its worktrees and mutant lanes). It is taken
 * again only when the key of the inputs now (keyOf: every path and hash, the tools' versions) is the
 * key it was earned with; whyValid says so in words.
 */
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require('fs');
const { dirname, join, normalize, relative, resolve, sep } = require('path');

const MOBILE = join(__dirname, '..', '..');
const ROOT = join(MOBILE, '..');

/** A file's sha256. */
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** A path from the root, with forward slashes. */
const fromRoot = (abs, root = ROOT) => relative(root, abs).split(sep).join('/');

/**
 * Code read for the files it names: scripts and modules, their comments taken out first (a comment
 * names a file it reads no more than a ledger does). Any other input (a fixture, a JSON, a ledger) is
 * hashed, never followed: what it lists is data, not files the check reads.
 */
const CODE = /\.(?:[cm]?js|jsx|tsx?|sh)$/i;

/** A file's code with its comments taken out: `//` and block comments, or a shell's `#` to the line's end. */
const uncommented = (text, file) => (/\.sh$/i.test(file)
  ? text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '$1')).join('\n')
  : text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'));
const EXT = 'mjs|cjs|js|jsx|ts|tsx|sh|json|yaml|yml|tsv|txt|md|toml|png|xml|dex';
/** The extensions node and jest try for an import without one, and the index they try in a folder. */
const TRIES = ['', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];

/** A file there, as a real file (a folder or nothing is none). */
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

/**
 * The repository files a text names, from where it stands (`at`, a path from the root): absolute paths.
 * `mobile` and `root` are the folders the app's paths and the repository's start from.
 */
const referencesIn = (text, at, { root = ROOT, mobile = join(root, 'mobile'), named = null } = {}) => {
  const here = dirname(join(root, at));
  const found = new Set();
  const inRepo = (abs) => !relative(root, abs).startsWith('..') && !abs.split(sep).includes('node_modules');
  const take = (abs) => { if (abs && inRepo(abs) && isFile(abs)) found.add(normalize(abs)); };
  // Paths with a folder in them, from mobile/, from the root, or from the naming file's folder; a path
  // after a variable or a <rootDir> is read from those too.
  for (const [p] of text.matchAll(new RegExp(`(?<![\\w.-])(?:\\.{1,2}\\/)?[\\w.-]+(?:\\/[\\w.-]+)+\\.(?:${EXT})\\b`, 'g'))) {
    take(resolve(mobile, p.replace(/^mobile\//, '')));
    take(resolve(root, p));
    take(resolve(here, p));
  }
  // Bare names, the last part of a path built in code among them: from the naming file's folder, or
  // wherever the repository holds the one file of that name.
  for (const [p] of text.matchAll(new RegExp(`(?<![\\w.-])[\\w-][\\w.-]*\\.(?:${EXT})\\b`, 'g'))) {
    take(join(here, p));
    const only = named?.get(p);
    if (only && only.length === 1) take(join(root, only[0]));
  }
  // Imports and requires: relative, or from the app's root.
  for (const m of text.matchAll(/(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*|\bjest\.(?:mock|requireActual)\s*\(\s*)['"]((?:\.{1,2}\/|@\/)[^'"]+)['"]/g)) {
    const spec = m[1];
    const base = spec.startsWith('@/') ? join(mobile, spec.slice(2)) : join(here, spec);
    const hit = TRIES.map((t) => base + t).find(isFile);
    take(hit);
  }
  // join(__dirname, 'a', 'b') and resolve(__dirname, ...).
  for (const m of text.matchAll(/\b(?:join|resolve)\(\s*__dirname((?:\s*,\s*['"][^'"]*['"])+)\s*\)/g)) {
    const parts = [...m[1].matchAll(/['"]([^'"]*)['"]/g)].map((x) => x[1]);
    take(join(here, ...parts));
  }
  return [...found];
};

/** The repository's files by their names (git's list; a folder's own files where it is no repository): paths from the root. */
const filesByName = (root) => {
  let files;
  try {
    files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === '.git' ? []
      : e.isDirectory() ? walk(dir ? `${dir}/${e.name}` : e.name) : [dir ? `${dir}/${e.name}` : e.name]));
    files = walk('');
  }
  const named = new Map();
  for (const f of files) { const n = f.split('/').pop(); named.set(n, [...(named.get(n) ?? []), f]); }
  return named;
};

/** Within one run: each root's files by name, and each code file's names by the hash of its bytes. */
const byNameOf = new Map();
const namesOf = new Map();

/** Every file the seeds read, and every file those read, to the end: paths from the root, sorted. */
const inputsOf = (seeds, { root = ROOT, mobile = join(root, 'mobile') } = {}) => {
  if (!byNameOf.has(root)) byNameOf.set(root, filesByName(root));
  const named = byNameOf.get(root);
  const seen = new Set();
  const queue = seeds.map((s) => normalize(join(root, s))).filter(isFile);
  while (queue.length) {
    const abs = queue.pop();
    const rel = fromRoot(abs, root);
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!CODE.test(abs)) continue;
    const bytes = readFileSync(abs);
    const at = `${root}|${rel}|${sha(bytes)}`;
    if (!namesOf.has(at)) namesOf.set(at, referencesIn(uncommented(bytes.toString('utf8'), abs), rel, { root, mobile, named }));
    for (const next of namesOf.get(at)) if (!seen.has(fromRoot(next, root))) queue.push(next);
  }
  return [...seen].sort();
};

/**
 * What every test runs under, whatever it reads: the jest config and every file it names (its setup
 * files and environment run before each test file), and the packages' locked versions. Seeds from the
 * root: jest reads mobile/jest.config.js by its own rule, and the lock file fixes every package jest,
 * babel and the preset bring.
 */
const UNDER = ['mobile/jest.config.js', 'mobile/package.json', 'mobile/package-lock.json', 'mobile/tsconfig.json'];

/**
 * The push check's own engine for a verdict it keeps: the files that run the check and keep its verdict,
 * each hashed whole (what they import decides which checks run, not what a check finds).
 */
const ENGINE = ['mobile/scripts/hooks/jest-run.cjs', 'mobile/scripts/hooks/pre-push.cjs', 'mobile/scripts/hooks/verdicts.cjs'];

/** The versions of what runs a check: node, and bash where there is one. */
const toolsNow = () => {
  let bash = 'none';
  try { bash = execFileSync(process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash', ['--version'], { encoding: 'utf8' }).split('\n')[0].trim(); } catch { /* no bash */ }
  return { node: process.version, bash };
};

/** Each input's sha256, by its path from the root. */
const hashesOf = (inputs, root = ROOT) => Object.fromEntries(inputs.map((p) => [p, sha(readFileSync(join(root, p)))]));

/** One key for these hashes and tools: equal only when every path, every byte and every version is. */
const keyOf = (hashes, tools) => sha(JSON.stringify({ hashes: Object.keys(hashes).sort().map((p) => [p, hashes[p]]), tools }));

/** The repository's own git folder, where the verdicts are kept: one per clone, never tracked. */
const verdictsDir = (cwd = MOBILE) => join(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8' }).trim(), 'rh-verdicts');

const readBook = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };

/** The verdicts kept: a check's green is `passed`, a mutant's is `caught`. */
const GREEN = new Set(['passed', 'caught']);

/** The green verdict kept for this check whose key is this key, or null: a red one is never kept. */
const lookup = (book, id, key) => {
  const v = book[id];
  return v && GREEN.has(v.verdict) && v.key === key ? v : null;
};

/** A green verdict kept, with the hashes it was earned on; a red one removes any kept before. */
const remember = (book, id, { key, hashes, tools, verdict, commit, report }) => {
  if (!GREEN.has(verdict)) { delete book[id]; return book; }
  book[id] = { key, verdict, hashes, tools, commit, at: new Date().toISOString(), ...(report ? { report } : {}) };
  return book;
};

/** Why a kept verdict stands for a run now, in words. */
const whyValid = (id, v) => `${id}: ${v.verdict} at ${v.commit.slice(0, 8)} (${v.at}), and every one of its ${Object.keys(v.hashes).length} inputs `
  + `is byte for byte as it was then (key ${v.key.slice(0, 12)}), on ${v.tools.node} and ${v.tools.bash}: not run again`;

/** The book of one kind of verdict (rehearsals, mutants), read and written whole under a lock. */
const bookFile = (kind, dir = verdictsDir()) => { mkdirSync(dir, { recursive: true }); return join(dir, `${kind}.json`); };
const writeBook = (file, book) => writeFileSync(file, `${JSON.stringify(book)}\n`);

/**
 * The flow runner's rehearsals' inputs: the script, the rehearsal files, every file they read, name or
 * source, to the end, what every test runs under, and the engine.
 */
const rehearsalInputs = (rehearsals, root = ROOT) => [...new Set([
  ...inputsOf(['mobile/e2e/run-flows.sh', ...rehearsals.map((p) => `mobile/${p}`), ...UNDER], { root }),
  ...ENGINE.filter((p) => isFile(join(root, p))),
])].sort();

/** The rehearsals' inputs now: the list, each hash, the tools, and their key. */
const rehearsalState = (rehearsals, root = ROOT) => {
  const inputs = rehearsalInputs(rehearsals, root);
  const hashes = hashesOf(inputs, root);
  const tools = toolsNow();
  return { inputs, hashes, tools, key: keyOf(hashes, tools) };
};

/** The rehearsals' report kept with their green verdict. */
const REHEARSAL_REPORT = 'rehearsals.report.json';

/**
 *   node scripts/hooks/verdicts.cjs --reuse <rehearsal list> --out <report>
 * The rehearsals' kept green verdict, taken when their inputs now are what earned it: says why, and
 * writes the report it was earned with to <out>. Exits 1, writing nothing, when they are not.
 */
if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
  const list = flag('--reuse');
  const out = flag('--out');
  if (!list || !out) { console.error('usage: verdicts.cjs --reuse <rehearsal list> --out <report>'); process.exit(2); }
  const rehearsals = readFileSync(list, 'utf8').split(/\r?\n/).filter(Boolean);
  const now = rehearsalState(rehearsals);
  const kept = lookup(readBook(bookFile('rehearsals')), 'rehearsals', now.key);
  if (!kept) { console.log('the rehearsals\' inputs are not those of their last green run: they were not taken from it'); process.exit(1); }
  writeFileSync(out, readFileSync(join(verdictsDir(), REHEARSAL_REPORT)));
  console.log(whyValid('the flow runner\'s rehearsals', kept));
}

module.exports = { ENGINE, REHEARSAL_REPORT, UNDER, rehearsalState, bookFile, hashesOf, rehearsalInputs, uncommented, inputsOf, keyOf, lookup, readBook, referencesIn, remember, sha, toolsNow, verdictsDir, whyValid, writeBook };
