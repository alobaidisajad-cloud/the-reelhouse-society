/**
 * universe — the one list of the files each sweep reads.
 *
 * A guard that walks folders itself reads the folders its author knew of, and
 * nothing tells it when a new one appears: a migration tree, a route group, a
 * script folder. So every sweep asks this module for its files by the name of
 * a universe, and the rules below are the only place a folder is named. A new
 * folder inside a universe's roots is seen by every sweep over that universe at
 * once; a new folder no rule names fails theUniverseNamesEveryFile.test.ts until
 * a rule says what it is. aSweepAsksTheUniverse.test.ts keeps every test and
 * script from walking folders on its own.
 *
 * Plain CommonJS, like stripComments.js, so the node scripts and the tests read
 * the very same lists. Each list is built once per process.
 *
 *   const { files, rel, kindOf } = require('../test-utils/universe');
 *   files('appCode')                       // absolute paths, sorted
 *   files(['appCode', 'appTests'], { ext: ['.tsx'] })
 *   rel(path)                              // a path from mobile/, '/' between folders
 */
const fs = require('fs');
const path = require('path');

const CODE = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** Folders no universe reaches into, anywhere: installs, native builds, made output. */
const NEVER = new Set(['node_modules', '.git', 'android', 'ios', 'dist', 'coverage', '.expo', 'web-build', 'scratch']);

/** Folders made by a run or a tool, by their place under the repo. */
const MADE = ['mobile/mockups/out', 'mobile/docs', '.claude/worktrees', 'mobile/.claude/worktrees', 'supabase/.temp', 'supabase/supabase/.temp', 'mobile/supabase/.temp', 'mobile/e2e/supabase/.temp'];

const isTest = (r) => /(^|\/)(__tests__|__mocks__|test-support)\//.test(r) || /\.(test|spec|release-test)\.[cm]?[jt]sx?$/.test(r);
const isCode = (r) => CODE.includes(path.posix.extname(r)) || r.endsWith('.d.ts');
const ext = (...list) => (r) => list.includes(path.posix.extname(r));

/**
 * The universes. `roots` are folders under the repo; `keep` decides each file by
 * its path from the repo, with `/` between folders; `top` reads only the files
 * directly in a root. What each one is FOR is in `says`.
 */
const UNIVERSES = {
  routes: {
    says: 'the route files: every file expo-router loads from app/, layouts included',
    roots: ['mobile/app'],
    keep: (r) => isCode(r) && !isTest(r),
  },
  appCode: {
    says: 'the app: every source file under app/ and src/, and every code file a route reaches outside them',
    roots: ['mobile/app', 'mobile/src'],
    keep: (r) => isCode(r) && !isTest(r),
    withClosure: true,
  },
  appData: {
    says: "the app's own data files under app/ and src/, which its code imports",
    roots: ['mobile/app', 'mobile/src'],
    keep: (r) => r.endsWith('.json') && !isTest(r),
  },
  appTests: {
    says: "the app's own tests: every test file, fixture and mock under app/ and src/",
    roots: ['mobile/app', 'mobile/src'],
    keep: (r) => isTest(r),
  },
  tests: {
    says: 'every test file in mobile/, wherever it lives, and every file of its folders',
    roots: ['mobile'],
    keep: (r) => isTest(r),
  },
  testSupport: {
    says: 'what the tests share: test-utils/, outside its own tests',
    roots: ['mobile/test-utils'],
    keep: (r) => !isTest(r) && !r.endsWith('.md'),
  },
  scripts: {
    says: 'every script that ships: the checks and tools run by hand, by a hook or by CI, and what they read',
    roots: ['mobile/scripts', 'mobile/e2e', 'mobile/mockups/tools', 'mobile/githooks', 'mobile/plugins', 'mobile/.claude/hooks', 'mobile/supabase/diagnostics'],
    keep: (r) => !isTest(r) && !r.startsWith('mobile/e2e/supabase/') && !r.endsWith('.md'),
  },
  config: {
    says: "the app's build and test configuration at the top of mobile/",
    roots: ['mobile'],
    top: true,
    keep: (r) => isCode(r) || /\.json$/.test(r),
  },
  mockups: {
    says: 'the drawn pages: their generators, fixtures and records (the tools are scripts)',
    roots: ['mobile/mockups'],
    keep: (r) => !r.startsWith('mobile/mockups/tools/') && !isTest(r) && !r.endsWith('.md'),
  },
  flows: {
    says: 'the Maestro flows, their subflows and the keyboard probes',
    roots: ['mobile/.maestro'],
    keep: ext('.yaml', '.yml'),
  },
  flowScripts: {
    says: "the scripts a flow runs (runScript): Maestro runs them on the runner, with the flow's env and its http client",
    roots: ['mobile/.maestro'],
    keep: ext('.js'),
  },
  runFlows: {
    says: "the flows the runner runs: .maestro/config.yaml names the files directly in .maestro/, and only those",
    roots: ['mobile/.maestro'],
    top: true,
    keep: (r) => r.endsWith('.yaml') && r !== 'mobile/.maestro/config.yaml',
  },
  docs: {
    says: 'the prose: every Markdown file in mobile/ and in the root supabase/ tree',
    roots: ['mobile', 'supabase'],
    keep: (r) => r.endsWith('.md'),
  },
  workflows: {
    says: 'the CI workflows GitHub runs',
    roots: ['.github/workflows'],
    top: true,
    keep: ext('.yaml', '.yml'),
  },
  migrations: {
    says: 'the migrations, in both trees: only the files directly in each migrations folder are applied',
    roots: ['supabase/migrations', 'mobile/supabase/migrations'],
    top: true,
    keep: ext('.sql'),
  },
  notMigrations: {
    says: "not a migration: root supabase/migrations/archive/ is SQL the CLI never applies, kept until it is decided",
    roots: ['supabase/migrations/archive'],
    keep: ext('.sql'),
  },
  undo: {
    says: "the undo files: each pending migration's undo, under its own name; no tool applies them as migrations",
    roots: ['mobile/supabase/migrations-down'],
    keep: ext('.sql'),
  },
  snapshot: {
    says: "the schema snapshot: production's schema as it stands",
    roots: ['mobile/supabase/schema'],
    keep: ext('.sql'),
  },
  rehearsals: {
    says: "the rehearsals: each migration's proof, run against production's shape in CI",
    roots: ['mobile/supabase/diagnostics'],
    keep: (r) => r.endsWith('_rehearsal.sql'),
  },
  supabaseSql: {
    says: 'every SQL file in both supabase/ trees, of every kind (kindOf says which)',
    roots: ['supabase', 'mobile/supabase'],
    keep: ext('.sql'),
  },
  functions: {
    says: 'the edge functions, in both trees',
    roots: ['supabase/functions', 'mobile/supabase/functions'],
    keep: (r) => isCode(r) && !isTest(r),
  },
  standIns: {
    says: "the E2E world's stand-in edge functions",
    roots: ['mobile/e2e/supabase/functions'],
    keep: (r) => isCode(r) && !isTest(r),
  },
  website: {
    says: "the website's code, read only as a caller of the same server",
    roots: ['src', 'api'],
    keep: (r) => isCode(r) && !isTest(r),
  },
};

/**
 * What a file in the two supabase/ trees is. Every file there has one kind, or
 * 'unknown', which theUniverseNamesEveryFile.test.ts refuses.
 */
function kindOfRel(r) {
  const top = (dir) => path.posix.dirname(r) === dir;
  if (top('supabase/migrations') || top('mobile/supabase/migrations')) return r.endsWith('.sql') ? 'migration' : r.endsWith('.md') ? 'doc' : 'unknown';
  if (r.startsWith('supabase/migrations/archive/')) return r.endsWith('.sql') ? 'not a migration' : 'unknown';
  if (r.startsWith('mobile/supabase/migrations-down/')) return r.endsWith('.sql') ? 'undo' : r.endsWith('.md') ? 'doc' : 'unknown';
  if (r.startsWith('mobile/supabase/schema/')) return 'snapshot';
  if (r === 'mobile/supabase/_schema_baseline.sql') return 'old snapshot';
  if (/^(mobile\/)?supabase\/functions\//.test(r)) return 'function';
  if (r.startsWith('mobile/supabase/diagnostics/')) return r.endsWith('_rehearsal.sql') ? 'rehearsal' : r.endsWith('.sql') ? 'diagnostic' : 'script';
  if (r.startsWith('mobile/supabase/restore/')) return 'restore';
  if (r.startsWith('mobile/supabase/sql/')) return 'loose sql';
  if (r.startsWith('supabase/email_templates/')) return 'email template';
  if (r === 'mobile/supabase/APPLIED.txt' || r === 'mobile/supabase/DEFERRED-ACTIONS.md') return 'record';
  return 'unknown';
}

/**
 * The files no sweep walks over, each with why. theUniverseNamesEveryFile.test.ts
 * holds every file under mobile/ to a universe or to one of these, and every
 * file in both supabase/ trees to a kind.
 */
const NOT_SWEPT = [
  { why: 'the audit, design and register records beside their prose', match: (r) => /^mobile\/(audit|design|register|\.kiro)\//.test(r) && !r.endsWith('.md') },
  { why: 'pictures, fonts and sounds the app shows', match: (r) => r.startsWith('mobile/assets/') },
  { why: 'patches applied to installed packages at install', match: (r) => r.startsWith('mobile/patches/') },
  { why: "the editor's and the agent's own settings", match: (r) => /^mobile\/\.(vscode|claude)\/[^/]+$/.test(r) && !r.endsWith('.cjs') },
  { why: 'a workflow folder GitHub never runs (only the top .github/workflows/ runs)', match: (r) => r.startsWith('mobile/.github/') },
  { why: 'type declarations for a package', match: (r) => r.startsWith('mobile/types/') },
  { why: 'files git and the env read at the top of mobile/', match: (r) => /^mobile\/(\.gitignore|\.env\.example)$/.test(r) },
  { why: 'the E2E world configuration the Supabase CLI reads', match: (r) => r === 'mobile/e2e/supabase/config.toml' },
  { why: 'the recordings the stand-in TMDB answers from', match: (r) => r.startsWith('mobile/e2e/supabase/functions/tmdb-proxy/fixtures/') },
];

/**
 * The files git ignores in a repo (a local .env, a log, a scratch file): no
 * checkout but this machine's has them, so no sweep reads them. Empty for a
 * folder that is not a git repo.
 */
const ignoredBy = new Map();
function ignored(repo) {
  if (!ignoredBy.has(repo)) {
    let list = [];
    try {
      // --directory: a folder git ignores whole is one line ending in '/', not its every file.
      list = require('child_process').execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
        { cwd: repo, encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
    } catch { list = []; }
    const files = new Set(list.filter((l) => !l.endsWith('/')));
    const folders = list.filter((l) => l.endsWith('/'));
    ignoredBy.set(repo, { has: (r) => files.has(r) || folders.some((f) => r.startsWith(f)) });
  }
  return ignoredBy.get(repo);
}

/** Every file under a folder, as paths from the repo, skipping what no universe reaches and what git ignores. */
function walk(repo, rootRel, top, out) {
  let entries;
  try { entries = fs.readdirSync(path.join(repo, rootRel), { withFileTypes: true }); } catch { return out; }
  const skip = ignored(repo);
  for (const e of entries) {
    const r = rootRel ? `${rootRel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!top && !NEVER.has(e.name) && !MADE.includes(r)) walk(repo, r, false, out);
    } else if (!skip.has(r)) out.push(r);
  }
  return out;
}

/** The import specifiers a file names: import, export … from, require(), import(). */
function specifiersOf(ts, text) {
  return ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);
}

/** What the phone bundle reads in place of a package (metro.config.js says why). */
const METRO_ALIASES = { 'lucide-react-native': 'mobile/src/generated/lucideIcons.js' };
const METRO_EXTRA = ['mobile/src/lib/nativeOnly/revenuecatWebStub.js'];
const PLATFORMS = ['', '.ios', '.android', '.native'];
const RESOLVE = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

/** The universe at a repo root: this checkout's, or one a test builds elsewhere. */
function at(repo) {
  const mobile = path.join(repo, 'mobile');
  const cache = new Map();
  const abs = (r) => path.join(repo, ...r.split('/'));
  const relRepo = (p) => path.relative(repo, p).split(path.sep).join('/');
  let known;
  /** Whether a file exists: mobile/ is listed once, so resolving asks the disk only outside it. */
  const exists = (r) => {
    if (!known) known = new Set(walk(repo, 'mobile', false, []));
    if (r.startsWith('mobile/')) return known.has(r);
    try { return fs.statSync(abs(r)).isFile(); } catch { return false; }
  };

  /** Every file a module specifier can mean: each platform's file ships, so each is reached. */
  function resolve(fromRel, spec) {
    let base;
    if (METRO_ALIASES[spec]) return [METRO_ALIASES[spec]];
    if (spec.startsWith('@/')) base = `mobile/${spec.slice(2)}`;
    else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
    else return [];
    if (path.posix.extname(base) && !RESOLVE.includes(path.posix.extname(base)) && exists(base)) return [base];
    const found = [];
    if (exists(base) && RESOLVE.includes(path.posix.extname(base))) found.push(base);
    for (const p of PLATFORMS) for (const e of RESOLVE) if (exists(`${base}${p}${e}`)) found.push(`${base}${p}${e}`);
    if (!found.length) for (const p of PLATFORMS) for (const e of RESOLVE) if (exists(`${base}/index${p}${e}`)) found.push(`${base}/index${p}${e}`);
    return found;
  }

  /**
   * Every file reached from a route file, following imports, exports and
   * requires, as paths from the repo. It stops at installed packages: they are
   * not the app's own code, and node_modules is in no universe.
   */
  function closureRel() {
    if (cache.has('#closure')) return cache.get('#closure');
    const ts = require('typescript');
    const seen = new Set();
    const queue = [...listRel('routes'), ...METRO_EXTRA.filter(exists)];
    while (queue.length) {
      const r = queue.pop();
      if (seen.has(r) || r.split('/').some((s) => NEVER.has(s))) continue;
      seen.add(r);
      if (!CODE.includes(path.posix.extname(r))) continue;
      for (const spec of specifiersOf(ts, fs.readFileSync(abs(r), 'utf8'))) {
        for (const next of resolve(r, spec)) if (!seen.has(next)) queue.push(next);
      }
    }
    const out = [...seen].sort();
    cache.set('#closure', out);
    return out;
  }

  function listRel(name) {
    if (cache.has(name)) return cache.get(name);
    const u = UNIVERSES[name];
    if (!u) throw new Error(`universe: no universe called ${name} (there are ${Object.keys(UNIVERSES).join(', ')})`);
    const found = new Set();
    for (const root of u.roots) for (const r of walk(repo, root, Boolean(u.top), [])) if (u.keep(r)) found.add(r);
    if (u.withClosure) for (const r of closureRel()) if (isCode(r) && !isTest(r)) found.add(r);
    const out = [...found].sort();
    cache.set(name, out);
    return out;
  }

  /**
   * The files of one universe or several, as absolute paths, sorted.
   * `ext` keeps only those endings, for a sweep whose rule is about one language;
   * `under` keeps only the files in those folders or with those names (paths
   * from mobile/), for a sweep whose rule is about one feature.
   */
  function files(names, opts = {}) {
    const all = new Set([].concat(names).flatMap(listRel));
    let out = [...all].sort();
    if (opts.ext) out = out.filter((r) => opts.ext.some((e) => r.endsWith(e)));
    if (opts.under) {
      const want = opts.under.map((u) => `mobile/${u.replace(/\/$/, '')}`);
      out = out.filter((r) => want.some((w) => r === w || r.startsWith(`${w}/`)));
    }
    return out.map(abs);
  }

  return {
    REPO: repo,
    MOBILE: mobile,
    files,
    /** Every file reached from a route file, code and assets, as absolute paths. */
    routeClosure: () => closureRel().map(abs),
    /** A path from mobile/, with `/` between folders. */
    rel: (p) => path.relative(mobile, p).split(path.sep).join('/'),
    /** A path from the repo root, with `/` between folders. */
    repoRel: relRepo,
    /** What a file in the supabase/ trees is: 'migration', 'undo', … or 'unknown'. */
    kindOf: (p) => kindOfRel(path.isAbsolute(p) ? relRepo(p) : p.split(path.sep).join('/')),
    /** Why no sweep walks over this file, or null when one should. */
    notSweptBecause: (p) => {
      const r = path.isAbsolute(p) ? relRepo(p) : p;
      const hit = NOT_SWEPT.find((u) => u.match(r));
      return hit ? hit.why : null;
    },
    /** Every file under mobile/ and both supabase/ trees, from the repo, for the census. */
    everyFile: () => [...walk(repo, 'mobile', false, []), ...walk(repo, 'supabase', false, [])].sort(),
    /** Which universes hold this file (a path from the repo). */
    universesOf: (r) => Object.keys(UNIVERSES).filter((n) => {
      if (!cache.has(`#set:${n}`)) cache.set(`#set:${n}`, new Set(listRel(n)));
      return cache.get(`#set:${n}`).has(r);
    }),
  };
}

module.exports = { ...at(path.join(__dirname, '..', '..')), at, UNIVERSES, isTest };
