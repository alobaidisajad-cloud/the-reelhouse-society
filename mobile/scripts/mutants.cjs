#!/usr/bin/env node
/**
 * The mutants that prove every guard (WORKLIST P0.66, P0.67, P0.69, P0.71).
 *
 * Each mutant in mobile/register/mutants.yaml puts one mistake of a class back
 * into today's code, and the class's own named test must fail on it:
 *   - past:  the class's past fix reversed (`commit`, `files`), each hunk placed
 *            by the code around it, never by its line numbers. When the fix no
 *            longer reverses, the verdict is NOT-APPLIED, and an equivalent
 *            written once by hand (`edits`) is used from then on in its place.
 *   - shape: a new shape of the mistake planted into a real folder (`plant`, a
 *            new file) or written into a real file (`edits`).
 *   - judge: an E2E judge fed a bad log, made from a good log by `edits`; the
 *            judge must take the good log and refuse the bad one.
 *
 * A mutant counts only if (the kill rules, P0.71):
 *   - its files were clean at this commit, and its test passed on them first;
 *   - each file really changed: its hash, and its text with line endings made one;
 *   - it compiles, unless it is declared a type error, which the type checker must then catch;
 *   - the named test itself failed: another test failing, or the file failing to load, does not count;
 *   - every file was put back and read back byte for byte before the next.
 *
 *   node mobile/scripts/mutants.cjs                  every mutant
 *   node mobile/scripts/mutants.cjs --ids a,b        those named (--ids @<file>: one id a line)
 *   node mobile/scripts/mutants.cjs --results <file> also writes the count-only results (ids and verdicts, P0.39)
 *   node mobile/scripts/mutants.cjs --put-back       puts back what a stopped run left in place, and ends
 *   node mobile/scripts/mutants.cjs --green <report>[,<report>]
 *                                                    a mutant whose test a jest --json report of this same
 *                                                    committed tree holds passing counts that as its first run
 *   node mobile/scripts/mutants.cjs --types-out <file> --ids a,b
 *                                                    the warm checker: each one's type check in memory, a
 *                                                    line each to <file>, nothing written to the checkout
 *   node mobile/scripts/mutants.cjs --rerun          every one run, none taken from a kept verdict (mutantState)
 *   node mobile/scripts/mutants.cjs --types-from <file>
 *                                                    a mutant's type check taken from those lines where they
 *                                                    were made from its very bytes; tsc's own otherwise
 *
 * Any other argument, or an option without its value, is refused before anything runs. Every
 * run first puts back what a stopped run left in place (the mutant in place, below).
 *
 * The verdicts: caught, survived, NOT-APPLIED, or invalid (a rule above not met). Only caught passes.
 */
const { createHash } = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } = require('fs');
const { Buffer } = require('buffer');
const os = require('os');
const { dirname, extname, join, relative, resolve } = require('path');

const { tmpdir } = os;

const MOBILE = join(__dirname, '..');
const ROOT = join(MOBILE, '..');
const yaml = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js'));
const REGISTRY = join(MOBILE, 'register', 'mutants.yaml');

const lf = (s) => s.split('\r\n').join('\n');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const CR_LF = (text) => text.includes('\r\n');
/** Text written back in the line endings the file had. */
const asFile = (text, like) => (CR_LF(like) ? lf(text).split('\n').join('\r\n') : text);

/** The hunks of one file in a commit: what each said before the commit and after it, context included. */
const hunksOf = (commit, file) => {
  const fromTop = relative(ROOT, join(MOBILE, file)).split('\\').join('/');
  const diff = execFileSync('git', ['show', '--format=', '--no-color', '-U3', commit, '--', fromTop], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
  if (!diff.trim()) throw new Error(`${commit} does not change ${fromTop}`);
  const hunks = [];
  let h = null;
  for (const line of lf(diff).split('\n')) {
    if (line.startsWith('@@')) { h = { before: [], after: [] }; hunks.push(h); continue; }
    if (!h || line.startsWith('\\')) continue;
    const [mark, rest] = [line[0], line.slice(1)];
    if (mark === ' ') { h.before.push(rest); h.after.push(rest); } else if (mark === '-') h.before.push(rest); else if (mark === '+') h.after.push(rest);
  }
  return hunks;
};

/** Each `find` replaced by its `replace`; a find not there exactly once makes the whole change NOT-APPLIED. */
const applyEdits = (text, edits) => {
  let out = lf(text);
  for (const { find, replace } of edits) {
    const at = out.indexOf(lf(find));
    if (at < 0) return { notApplied: `not found: ${lf(find).split('\n')[0].slice(0, 80)}` };
    if (out.indexOf(lf(find), at + 1) >= 0) return { notApplied: `found more than once: ${lf(find).split('\n')[0].slice(0, 80)}` };
    out = out.slice(0, at) + lf(replace) + out.slice(at + lf(find).length);
  }
  return { text: out };
};

/** A past fix's hunks reversed onto today's text: each hunk's after-text, found once, put back as it was before. */
const reverse = (text, hunks) => applyEdits(text, hunks.map((h) => ({ find: h.after.join('\n'), replace: h.before.join('\n') })));

/** What a mutant writes: [{ path, before (null for a new file), after }], or why it cannot. */
const changesOf = (m) => {
  const changes = [];
  for (const p of m.plant ?? []) {
    const path = join(MOBILE, p.path);
    if (existsSync(path)) return { notApplied: `${p.path} is already there` };
    changes.push({ file: p.path, path, before: null, after: p.text });
  }
  const byFile = new Map();
  for (const e of m.edits ?? []) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  if (m.source === 'past' && !m.edits) for (const f of m.files ?? []) byFile.set(f, null);
  for (const [file, edits] of byFile) {
    const path = join(MOBILE, file);
    if (!existsSync(path)) return { notApplied: `${file} is not there` };
    const before = readFileSync(path, 'utf8');
    const made = edits ? applyEdits(before, edits) : reverse(before, hunksOf(m.commit, file));
    if (made.notApplied) return { notApplied: `${file}: ${made.notApplied}` };
    changes.push({ file, path, before, after: asFile(made.text, before) });
  }
  return { changes };
};

/** Whether a change is a change: its bytes differ, and its text with line endings made one differs too. */
const really = (c) => c.before === null || (hash(c.before) !== hash(c.after) && lf(c.before) !== lf(c.after));

/** The named test's status in a jest --json report: passed, failed, or missing when it never ran. */
const statusIn = (report, title) => {
  const found = (report.testResults ?? []).flatMap((r) => r.assertionResults ?? []).filter((a) => a.title === title);
  if (found.some((a) => a.status === 'failed')) return 'failed';
  if (found.some((a) => a.status === 'passed')) return 'passed';
  return 'missing';
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The flow runner's rehearsals (e2e/__tests__/runFlows*.rehearsal.test.ts): whole runs of bash that
 * wait on the clock, whose timings a starved processor breaks.
 */
const REHEARSAL = /^e2e\/__tests__\/runFlows(?:\.[\w-]+)?\.rehearsal\.test\.ts$/;

/**
 * `fn` run with this process at normal priority, and its old priority back after: a child started
 * meanwhile starts at normal (Windows gives a child its parent's class only below normal). A push runs
 * its mutants below normal, beside the rehearsals at normal; a rehearsal a mutant runs is one of them.
 */
const atNormalPriority = (fn, at = os) => {
  const normal = os.constants.priority.PRIORITY_NORMAL;
  let was = null;
  try { was = at.getPriority(0); if (was !== normal) at.setPriority(0, normal); } catch { was = null; }
  try { return fn(); } finally { if (was !== null && was !== normal) { try { at.setPriority(0, was); } catch { /* left at normal */ } } }
};

/**
 * jest's arguments for one named test in one file, run in jest's own process: a file jest last saw
 * take over a second it otherwise runs in a pool of a worker per processor but one, eleven processes
 * started on this machine for the one file, and two such runs a mutant.
 */
const testArgs = (file, test, out) => ['--runTestsByPath', file, '-t', escapeRe(test), '--runInBand', '--json', '--outputFile', out, '--silent'];

/** A line that names an error: a fatal one, an exception, a module not found, memory or a disk run out, a kill. */
const ERROR_LINE = /FATAL|\b(?:[A-Z]\w*)?Error\b|\berror\b|Cannot |ENOMEM|ENOSPC|EBUSY|EPERM|out of memory|heap limit|Allocation failed|Killed|SIGKILL|SIGTERM/;
/** How much of a run's words a verdict keeps: from its first error line, this many lines and characters at most. */
const ERROR_LINES = 40;
const ERROR_CHARS = 4000;

/**
 * What a run that never reported said, in its own words: from the first line that names an error, up to
 * ERROR_LINES lines (and its last five lines when there were more), or its last fifteen lines when no
 * line names one; ERROR_CHARS characters at most, `head` (its exit) first. Never its tail alone: a jest
 * that died out of memory prints its own error first and a page of stack after it, and five lines of the
 * stack were all an invalid verdict said in the push gate of 2026-11-25.
 */
const errorWords = (text, head = '') => {
  const lines = lf(String(text ?? '')).split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  const at = lines.findIndex((l) => ERROR_LINE.test(l));
  const kept = at < 0 ? lines.slice(-15)
    : [...lines.slice(at, at + ERROR_LINES), ...(lines.length > at + ERROR_LINES ? ['…', ...lines.slice(Math.max(at + ERROR_LINES, lines.length - 5))] : [])];
  const words = `${head}${kept.join(' / ')}`.trim();
  return words.length > ERROR_CHARS ? `${words.slice(0, ERROR_CHARS)} …` : words;
};

/** One named test, run alone; its status, and jest's own words when it never ran. */
const runTest = ({ file, test }) => {
  const dir = mkdtempSync(join(tmpdir(), 'mutant-'));
  const out = join(dir, 'report.json');
  try {
    const run = () => spawnSync(process.execPath, [join(MOBILE, 'node_modules', 'jest', 'bin', 'jest.js'), ...testArgs(file, test, out)],
      { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e9 });
    const r = REHEARSAL.test(file) ? atNormalPriority(run) : run();
    if (!existsSync(out)) {
      const exit = `jest ended with no report (exit ${r.status ?? r.signal}${r.error ? `, ${r.error.message}` : ''}): `;
      return { status: 'missing', said: errorWords(`${r.stderr ?? ''}\n${r.stdout ?? ''}`, exit) };
    }
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const status = statusIn(report, test);
    const said = errorWords((report.testResults ?? []).map((t) => t.message).filter(Boolean).join('\n'));
    return { status, said };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** How this run's type checks were answered: by a warm checker from the same bytes, or by tsc. */
const typeAnswers = { warm: 0, tsc: 0 };

let tsInfo = null;
/** The type checker's errors (`file(line,col): error ...` lines), over the whole project, kept warm between mutants. */
const typeErrors = () => {
  tsInfo ??= join(mkdtempSync(join(tmpdir(), 'mutants-tsc-')), 'tsbuildinfo');
  const r = spawnSync(process.execPath, [join(MOBILE, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '--pretty', 'false',
    '-p', 'tsconfig.json', '--incremental', '--tsBuildInfoFile', tsInfo], { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e9 });
  return lf(`${r.stdout}${r.stderr}`).split('\n').filter((l) => / error TS\d+:/.test(l));
};

/** Whether a mutant's changes need the type checker: one of them is TypeScript. */
const typed = (changes) => changes.some((c) => /\.tsx?$/.test(c.file));

/**
 * The type checker kept warm, for a run of many mutants: the project (tsconfig.json, as tsc reads it)
 * built once from the files as committed, and each mutant's text checked against that build in memory,
 * nothing written. tsc's own incremental builder (createSemanticDiagnosticsBuilderProgram) rechecks
 * the files a change reaches, the changed ones and every one whose types depend on them, and keeps the
 * rest's diagnostics, as `tsc --incremental` does; each check starts from the committed build, never from
 * the mutant before it. Its errors are written as tsc --pretty false writes them, from mobile/. A
 * change it cannot hold in memory (a new file, whose place among the project's files only the config's
 * globs decide, or a tsconfig) is no change it checks: `holds` says so and the run asks tsc itself.
 */
const warmTypes = (mobile = MOBILE) => {
  const ts = require(join(MOBILE, 'node_modules', 'typescript'));
  const key = (f) => resolve(f).toLowerCase();
  const config = ts.getParsedCommandLineOfConfigFile(join(mobile, 'tsconfig.json'), {}, {
    ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, ' ')); },
  });
  const over = new Map();
  const texts = new Map();
  const files = new Map();
  const host = ts.createCompilerHost(config.options);
  host.getCurrentDirectory = () => mobile;
  host.readFile = (f) => {
    const k = key(f);
    if (over.has(k)) return over.get(k);
    if (!texts.has(k)) texts.set(k, ts.sys.readFile(f));
    return texts.get(k);
  };
  host.createHash = hash;
  host.getSourceFile = (f, language) => {
    const text = host.readFile(f);
    if (text === undefined) return undefined;
    const k = `${key(f)}|${typeof language === 'object' ? language.languageVersion : language}`;
    const kept = files.get(k);
    if (kept && kept.text === text) return kept.file;
    const file = ts.createSourceFile(f, text, language, true);
    file.version = hash(text);
    // A committed file is made once; a mutant's is made for its check alone.
    if (!over.has(key(f))) files.set(k, { text, file });
    return file;
  };
  const build = (old, roots = config.fileNames) => ts.createSemanticDiagnosticsBuilderProgram(roots, config.options, host, old,
    ts.getConfigFileParsingDiagnostics(config), config.projectReferences);
  const errorsOf = (program) => [...program.getConfigFileParsingDiagnostics(), ...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics(),
    ...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()].filter((d) => d.category === ts.DiagnosticCategory.Error);
  const formatHost = { getCanonicalFileName: (f) => f, getCurrentDirectory: () => mobile, getNewLine: () => '\n' };
  const lines = (errors) => lf(ts.formatDiagnostics(errors, formatHost)).split('\n').filter((l) => / error TS\d+:/.test(l));
  // Built over an empty build, every file is new to the builder, so each one's shape is its declarations
  // (a build from nothing takes each file's text for its shape, and then every change reaches every
  // file that imports it): a change that leaves a file's declarations as they were rechecks that file
  // alone, and one that changes them rechecks every file they reach.
  const committed = build(build(undefined, []));
  const atCommit = lines(errorsOf(committed));
  const holds = (changes) => changes.every((c) => c.before !== null && !/(^|\/)tsconfig[^/]*\.json$/.test(c.file.split('\\').join('/')));
  /** The type errors of the project with these changes in, as tsc would print them. */
  const check = (changes) => {
    over.clear();
    for (const c of changes) over.set(key(c.path), c.after);
    try { return lines(errorsOf(build(committed))); } finally { over.clear(); }
  };
  return { atCommit, check, holds };
};

/** The bytes a type check of these changes reads: each file's path from mobile/ and its text, hashed. */
const changesHash = (changes) => hash(JSON.stringify(changes.map((c) => [c.file, c.after])));

/**
 * A warm checker's answers, as another process writes them (--types-out, one JSON line each: its pid
 * first, then { id, hash, faults }, then { done }): the faults for this mutant when the answer was
 * made from exactly these bytes, else null, and the run asks tsc itself. Waits while the checker lives
 * and has not answered; a checker that ended or died without the answer is no answer.
 */
const typesFrom = (file, alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } }, pause = 500) => (m, changes) => {
  const want = changesHash(changes);
  for (;;) {
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    // Only whole lines: one being written is read on the next look.
    const said = text.slice(0, text.lastIndexOf('\n') + 1).split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    const answer = said.find((l) => l.id === m.id);
    if (answer) return answer.hash === want ? answer.faults : null;
    const pid = said.find((l) => typeof l.pid === 'number')?.pid;
    if (pid === undefined || said.some((l) => l.done) || !alive(pid)) return null;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause);
  }
};

/** Whether each changed file still parses or type-checks: [] when it does, else what was said. `types` answers the type check. */
const compileFaults = (changes, types = typeErrors) => [...(typed(changes) ? types() : []), ...syntaxFaults(changes)];

/** Whether each changed script, JSON and YAML file still parses: [] when each does, else what was said. */
const syntaxFaults = (changes) => {
  const faults = [];
  for (const c of changes) {
    const ext = extname(c.file);
    if (['.js', '.cjs', '.mjs'].includes(ext)) {
      const r = spawnSync(process.execPath, ['--check', c.path], { encoding: 'utf8' });
      if (r.status !== 0) faults.push(`${c.file}: ${lf(r.stderr).trim().split('\n').slice(0, 4).join(' / ')}`);
    } else if (ext === '.json') {
      try { JSON.parse(c.after); } catch (e) { faults.push(`${c.file}: ${e.message}`); }
    } else if (['.yml', '.yaml'].includes(ext)) {
      // Each document must parse: a Maestro flow is two (its config, then its steps).
      const errors = yaml.parseAllDocuments(c.after).flatMap((d) => d.errors ?? []);
      if (errors.length) faults.push(`${c.file}: ${errors[0].message.split('\n')[0]}`);
    }
  }
  return faults;
};

/** Every changed file put back, and read back as it was; a planted file gone. Throws if not: nothing runs on after. */
const restore = (changes) => {
  for (const c of changes) {
    if (c.before === null) { if (existsSync(c.path)) unlinkSync(c.path); } else writeFileSync(c.path, c.before);
  }
  for (const c of changes) {
    const ok = c.before === null ? !existsSync(c.path) : hash(readFileSync(c.path, 'utf8')) === hash(c.before);
    if (!ok) throw new Error(`${c.file} was not put back as it was: stop, and restore it by hand`);
  }
};

/**
 * The mutant in place: written before its files change, removed once they are put back. A run
 * ended from outside (a stopped task, a closed window: no signal reaches it) leaves it behind, so
 * the next run puts those files back before anything else, and the commit and push hooks refuse
 * while it is there. Git-ignored.
 */
const PLACED = join(MOBILE, '.mutant-in-place.json');

/** What a stopped run left in place, put back and read back; the files it names ([] when none). */
const putBackLeftover = (placed = PLACED) => {
  if (!existsSync(placed)) return [];
  const { changes } = JSON.parse(readFileSync(placed, 'utf8'));
  restore(changes);
  unlinkSync(placed);
  return changes.map((c) => c.file);
};

/** The options and whether each takes a value. */
const OPTIONS = {
  '--ids': true, '--changed': true, '--part': true, '--results': true, '--fresh': false, '--gather': true, '--out': true, '--put-back': false, '--green': true,
  '--types-out': true, '--types-from': true, '--rerun': false, '--record': true,
};

/** What is wrong with these arguments, or null: an unknown one, or an option missing its value. */
const argumentsFault = (argv) => {
  for (let k = 0; k < argv.length; k++) {
    const takes = OPTIONS[argv[k]];
    if (takes === undefined) return `unknown argument ${argv[k]} (the options: ${Object.keys(OPTIONS).join(', ')})`;
    if (takes) {
      if (argv[k + 1] === undefined || argv[k + 1] in OPTIONS) return `${argv[k]} wants a value`;
      k++;
    }
  }
  return null;
};

/** Paths git reports changed among these (a mutant runs only on files as committed). */
const dirty = (files) => {
  if (!files.length) return [];
  return execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: MOBILE, encoding: 'utf8' }).split('\n').filter(Boolean);
};

/** A judge's verdict on one folder of logs: its exit, and the first lines it printed. */
const judge = (m, dir) => {
  const args = m.judge.run.map((a) => a.split('{dir}').join(dir));
  const r = spawnSync(args[0] === 'node' ? process.execPath : args[0], args.slice(1),
    { cwd: MOBILE, encoding: 'utf8', maxBuffer: 1e8, env: { ...process.env, ...(m.judge.env ?? {}) } });
  return { status: r.status, said: lf(`${r.stdout}${r.stderr}`).trim().split('\n').slice(0, 2).join(' / ') };
};

/** A picture among a judge's records: carried as its bytes, never read as text, never edited. */
const PICTURE = /\.(png|jpe?g|webp)$/i;

/** Every file under a folder, by its path inside it (forward slashes): its text, or a picture's bytes. */
const readFolder = (dir, under = '') => {
  const out = {};
  for (const entry of readdirSync(join(dir, under), { withFileTypes: true })) {
    const rel = under ? `${under}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, readFolder(dir, rel));
    else out[rel] = PICTURE.test(rel) ? readFileSync(join(dir, rel)) : readFileSync(join(dir, rel), 'utf8');
  }
  return out;
};

/** Whether a record is unchanged: a picture's bytes, or a text's lines whatever their endings. */
const same = (a, b) => (Buffer.isBuffer(a) || Buffer.isBuffer(b) ? Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b) : lf(a) === lf(b));

/** Each of a judge's files written under a folder, at the path `as` gives it (a name the repo ignores, kept under another). */
const writeAll = (dir, files, as = {}) => {
  for (const [name, text] of Object.entries(files)) {
    const at = join(dir, as[name] ?? name);
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, text);
  }
};

/**
 * An E2E judge mutant: its logs (judge.files) made bad by edits, each edit naming its file. The bad
 * logs differ from the good ones; the judge takes the good (exit 0) and refuses the bad with its
 * refusal (judge.refuses, 1 unless said): an exit that means it could not read is not a refusal.
 */
const runJudge = (m) => {
  const good = m.judge.from ? readFolder(join(MOBILE, m.judge.from)) : (m.judge.files ?? {});
  const bad = { ...good };
  for (const e of m.edits ?? []) {
    if (!(e.file in bad)) return { verdict: 'invalid', why: `no log named ${e.file}` };
    if (Buffer.isBuffer(bad[e.file])) return { verdict: 'invalid', why: `${e.file} is a picture: an edit names a text` };
    const made = applyEdits(bad[e.file], [e]);
    if (made.notApplied) return { verdict: 'NOT-APPLIED', why: `${e.file}: ${made.notApplied}` };
    bad[e.file] = made.text;
  }
  if (Object.keys(good).every((f) => same(good[f], bad[f]))) return { verdict: 'invalid', why: 'the bad logs are the good logs' };
  const dir = mkdtempSync(join(tmpdir(), 'judge-'));
  try {
    writeAll(join(dir, 'good'), good, m.judge.as);
    writeAll(join(dir, 'bad'), bad, m.judge.as);
    const g = judge(m, join(dir, 'good'));
    if (g.status !== 0) return { verdict: 'invalid', why: `the judge refuses the good logs (exit ${g.status}): ${g.said}` };
    const b = judge(m, join(dir, 'bad'));
    if (b.status === 0) return { verdict: 'survived', why: `the judge took the bad logs: ${b.said}` };
    if (b.status !== (m.judge.refuses ?? 1)) return { verdict: 'invalid', why: `the judge could not read the bad logs (exit ${b.status}): ${b.said}` };
    return { verdict: 'caught', why: '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * Whether these jest --json reports hold the named test passing, in its own file: a run of the same
 * committed tree that already proved it green (the push's own jest run, scripts/hooks/pre-push.cjs).
 */
const greenIn = (reports, { file, test }) => reports.some((report) => (report.testResults ?? [])
  .filter((r) => String(r.name).split('\\').join('/').endsWith(`/mobile/${file}`))
  .some((r) => statusIn({ testResults: [r] }, test) === 'passed'));

/**
 * A written mutant's verdict, from what its compile check found (`faults`) and its named test's run
 * (`run`, null when it was not run): a declared type error is caught by the type checker naming one of
 * its files; any other is invalid when it does not compile, caught only when its named test failed,
 * survived when it passed, and invalid when it did not run at all (skipped, or the file never loaded).
 */
const verdictOf = (m, changes, faults, run) => {
  if (m.expect === 'type-error') {
    const named = faults.filter((f) => changes.some((c) => f.split('\\').join('/').includes(c.file)));
    return named.length ? { verdict: 'caught', why: '' } : { verdict: 'survived', why: 'the type checker took it' };
  }
  if (faults.length) return { verdict: 'invalid', why: `does not compile: ${faults.slice(0, 2).join(' / ')}` };
  if (run?.status === 'failed') return { verdict: 'caught', why: '' };
  if (run?.status === 'passed') return { verdict: 'survived', why: 'its test passed with the mistake in' };
  return { verdict: 'invalid', why: `its test did not run: ${run?.said ?? ''}`.trim() };
};

/**
 * One mutant, by the kill rules: its verdict and why. `green` are reports that already ran its test
 * green on this tree; `types`, when given, answers the type check of its changes (typesFrom), null
 * sending it to tsc. The type check is read after the named test has run: the verdict is the same
 * whichever ends first, and the test's run is not held waiting on it.
 */
const runOne = (m, green = [], types = null) => {
  if (m.source === 'judge') return runJudge(m);
  const files = [...new Set([...(m.files ?? []), ...(m.edits ?? []).map((e) => e.file), ...(m.plant ?? []).map((p) => p.path)])];
  const changed = dirty(files);
  if (changed.length) return { verdict: 'invalid', why: `not as committed: ${changed.join(', ')}` };
  const base = greenIn(green, m.proof) ? { status: 'passed' } : runTest(m.proof);
  if (base.status !== 'passed') return { verdict: 'invalid', why: `its test was not green first (${base.status}) ${base.said ?? ''}`.trim() };
  const plan = changesOf(m);
  if (plan.notApplied) return { verdict: 'NOT-APPLIED', why: plan.notApplied };
  const { changes } = plan;
  const same = changes.filter((c) => !really(c));
  if (same.length) return { verdict: 'invalid', why: `no real change to ${same.map((c) => c.file).join(', ')}` };
  writeFileSync(PLACED, JSON.stringify({ mutant: m.id, changes }));
  try {
    for (const c of changes) { mkdirSync(dirname(c.path), { recursive: true }); writeFileSync(c.path, c.after); }
    const typeFaults = () => {
      if (!typed(changes)) return [];
      const warm = types?.(m, changes);
      if (warm) { typeAnswers.warm++; return warm; }
      typeAnswers.tsc++;
      return typeErrors();
    };
    const own = syntaxFaults(changes);
    const r = m.expect === 'type-error' || own.length ? null : runTest(m.proof);
    return verdictOf(m, changes, [...typeFaults(), ...own], r);
  } finally {
    restore(changes);
    unlinkSync(PLACED);
  }
};

/** Whether `commit` is in the history of `head` (a commit this repository does not hold is not). */
const ancestor = (commit, head = 'HEAD', cwd = MOBILE) => {
  try { execFileSync('git', ['merge-base', '--is-ancestor', commit, head], { cwd, stdio: 'ignore' }); return true; } catch { return false; }
};

/**
 * The private half's entries that belong to this checkout. The file is one for every checkout of the
 * clone (the main checkout's plan folder), so a private mutant of work not yet pushed reached every
 * other push, whose files did not hold its target, and refused it (C20's seven, 2026-11-25). Each entry
 * names `since: <commit>`, the commit its files stand at, and runs only where that commit is in HEAD's
 * history. One that names none (`bare`) is never run: a mutants run refuses to start while one is there
 * (bareRefusal), in words. `aside` are those whose commit HEAD does not hold.
 */
const privateHalf = (entries, inHistory = (c) => ancestor(c)) => {
  const bare = entries.filter((m) => !/^[0-9a-f]{7,40}$/.test(String(m.since ?? '')));
  const kept = entries.filter((m) => !bare.includes(m) && inHistory(m.since));
  return { kept, aside: entries.filter((m) => !bare.includes(m) && !kept.includes(m)), bare };
};

/** Why a mutants run may not start for these private entries with no `since`, or null. */
const bareRefusal = (bare) => (bare.length
  ? `a mutants run refused: mutants.private.yaml's ${bare.map((m) => m.id).join(', ')} name${bare.length === 1 ? 's' : ''} no since: <commit>. `
    + 'Each private mutant names the commit its files stand at (the work it proves), and runs only in a checkout whose HEAD holds that commit: '
    + 'add since: <that commit> to each'
  : null);

/** The private half's file, in the main checkout's plan folder; null where this is no checkout. */
const privateFile = () => {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: MOBILE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return join(common, '..', 'mobile', 'audit', 'final', 'private', 'mutants.private.yaml');
  } catch { return null; }
};

/** The private entries of the file (none where there is no file), as privateHalf parts them. */
const readPrivate = (file = privateFile()) => privateHalf(file && existsSync(file) ? yaml.parse(readFileSync(file, 'utf8')).mutants ?? [] : []);

/** The registry, and the private half where this checkout can read it: each private entry whose commit HEAD holds. */
const readMutants = () => {
  const pub = yaml.parse(readFileSync(REGISTRY, 'utf8')).mutants ?? [];
  return [...pub, ...readPrivate().kept.map((m) => ({ ...m, private: true }))];
};

/** The proof id of a mutant's test: its index among its class's methods, m1 first. */
const proofId = (m, classes) => {
  const c = classes.find((k) => k.id === m.class);
  const i = (c?.methods ?? []).findIndex((x) => x.file === m.proof?.file && x.test === m.proof?.test);
  return i < 0 ? null : `m${i + 1}`;
};

/**
 * The paths a mutant stands on: the files it changes or plants, its test, its judge and the
 * judge's logs. A push that changes one runs it (P0.72); paths are from mobile/, as the registry
 * writes them.
 */
const pathsOf = (m) => [
  ...(m.files ?? []), ...(m.edits ?? []).filter(() => m.source !== 'judge').map((e) => e.file),
  ...(m.plant ?? []).map((p) => p.path), ...(m.proof ? [m.proof.file] : []),
  ...(m.judge ? [m.judge.run[1], `${m.judge.from}/`] : []),
].map((p) => p.split('\\').join('/'));

/**
 * The bytes a mutant's verdict stands on, and their key (scripts/hooks/verdicts.cjs): its own entry,
 * the files it changes, its proof or its judge and the judge's logs, every file those read to the end,
 * what every test runs under, and this runner. A kept `caught` is taken again only on this very key.
 */
const mutantState = (m, root = ROOT, tools = null) => {
  const v = require('./hooks/verdicts.cjs');
  const fromRoot = (p) => relative(root, join(root, 'mobile', p)).split('\\').join('/');
  const folder = (p) => (existsSync(join(root, 'mobile', p)) ? readdirSync(join(root, 'mobile', p), { recursive: true }).map(String)
    .filter((f) => statSync(join(root, 'mobile', p, f)).isFile()).map((f) => fromRoot(`${p}${f.split('\\').join('/')}`)) : []);
  const paths = pathsOf(m);
  const seeds = paths.filter((p) => !p.endsWith('/')).map(fromRoot);
  const inputs = [...new Set([...v.inputsOf([...seeds, ...v.UNDER], { root }), ...paths.filter((p) => p.endsWith('/')).flatMap(folder), 'mobile/scripts/mutants.cjs'])]
    .filter((p) => existsSync(join(root, p))).sort();
  const hashes = { ...v.hashesOf(inputs, root), [`register/mutants.yaml#${m.id}`]: hash(JSON.stringify({ ...m, private: undefined })) };
  const used = tools ?? v.toolsNow();
  return { inputs, hashes, tools: used, key: v.keyOf(hashes, used) };
};

/** Whether a changed path (from mobile/) is one a mutant stands on: the path itself, or one under its folder. */
const standsOn = (m, changed) => pathsOf(m).some((p) => (p.endsWith('/') ? changed.startsWith(p) : changed === p));

/** Paths git names (from the root), as the registry writes them: from mobile/. */
const fromMobile = (paths, root = ROOT) => paths.filter(Boolean).map((p) => relative(join(root, 'mobile'), join(root, p)).split('\\').join('/'));

/** The registry's entries at a commit ([] where it had none). */
const registryAt = (commit, root = ROOT) => {
  try {
    return yaml.parse(execFileSync('git', ['show', `${commit}:mobile/register/mutants.yaml`], { cwd: root, encoding: 'utf8', maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'pipe'] })).mutants ?? [];
  } catch { return []; }
};

/** An entry as the registry holds it, for comparing: the run's own `private` mark left out. */
const asEntry = (m) => JSON.stringify({ ...m, private: undefined });

/**
 * Why a recorded verdict does not stand for `m` now, or null when it stands and the mutant need not run
 * again. It stands when it is caught; its run's commit is in this history (`inHistory`: a merge keeps a
 * branch's commits, where a rebase writes new ones and every verdict recorded on the old ones is lost);
 * nothing the mutant stands on (pathsOf) and not the runner itself changed from that commit to now
 * (`changedSince`); its entry is the one the registry held then (`entryAt`); the proof id it was
 * recorded by is its test's place among its class's methods now (`proofNow`, where there are classes);
 * and the private record of that very run, which this machine keeps beside every run (P0.54), holds it
 * caught (`recordAt`): a
 * verdict written into the results by hand stands on no run, and a machine with no record (CI) runs it.
 */
const whyNotStanding = (m, r, { inHistory, changedSince, entryAt, recordAt, proofNow }) => {
  if (!r) return 'no verdict recorded';
  if (r.verdict !== 'caught') return `recorded ${r.verdict}`;
  if (!inHistory(r.commit)) return `run at ${String(r.commit).slice(0, 8)}, which is not in this history`;
  const changed = changedSince(r.commit);
  if (changed.includes('scripts/mutants.cjs')) return 'the runner changed since its run';
  const moved = changed.filter((c) => standsOn(m, c));
  if (moved.length) return `${moved.join(', ')} changed since its run`;
  if (asEntry(entryAt(r.commit, m.id) ?? null) !== asEntry(m)) return 'its entry changed since its run';
  // Its class's methods moved (a merge joined both sides'): its recorded proof id is another's now.
  const proof = proofNow?.(m);
  if (proof !== undefined && r.proof !== proof) return `its proof is ${proof} now, recorded as ${r.proof}`;
  if (!(recordAt(r.commit) ?? []).some((x) => x.mutant === m.id && x.verdict === 'caught')) return 'no private record of its run on this machine';
  return null;
};

/**
 * What whyNotStanding asks, from git and the private record, each commit's answer read once: against
 * `head` (a commit), or, with head null, against the working files and the commits of a merge in hand
 * (HEAD and MERGE_HEAD), as commit.cjs --merge asks before the merge is made.
 */
const standingContext = (head = 'HEAD', root = ROOT) => {
  const once = (fn) => { const seen = new Map(); return (k) => { if (!seen.has(k)) seen.set(k, fn(k)); return seen.get(k); }; };
  const diff = (c) => execFileSync('git', ['diff', '--name-only', c, ...(head ? [head] : [])], { cwd: root, encoding: 'utf8', maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'pipe'] }).split('\n');
  const entries = once((c) => registryAt(c, root));
  const dir = privateDir();
  // The classes as the working files hold them, the private ones too; undefined where there are none.
  const classesNow = once(() => {
    const file = join(root, 'mobile', 'register', 'classes.yaml');
    if (!existsSync(file)) return undefined;
    const joined = root === ROOT ? require('./register.cjs').readPrivate() : null;
    return [...(yaml.parse(readFileSync(file, 'utf8')).classes ?? []), ...(joined?.classes ?? [])];
  });
  return {
    inHistory: once((c) => (head ? ancestor(c, head, root) : ancestor(c, 'HEAD', root) || ancestor(c, 'MERGE_HEAD', root))),
    changedSince: once((c) => { try { return fromMobile(diff(c), root); } catch { return ['scripts/mutants.cjs']; } }),
    entryAt: (c, id) => entries(c).find((b) => b.id === id),
    recordAt: once((c) => { try { return JSON.parse(readFileSync(join(dir, 'mutants', `${c}.json`), 'utf8')); } catch { return null; } }),
    proofNow: (m) => {
      const classes = classesNow('working files');
      return classes ? (m.source === 'judge' ? 'judge' : proofId(m, classes)) : undefined;
    },
  };
};

/** The results file as this checkout holds it ([] where there is none). */
const RESULTS = join(MOBILE, 'register', 'mutant-results.json');
const readResults = (file = RESULTS) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return []; } };

/**
 * The mutants a change from `base` touches: by the paths they stand on, their own entry, or the runner;
 * less those whose recorded verdict still stands (whyNotStanding), unless `standing` is false (--rerun).
 * The array carries how many stood (`stood`).
 */
const touchedSince = (base, mutants, { standing = true, results = null, context = null } = {}) => {
  const changed = fromMobile(execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }).split('\n'));
  const before = registryAt(base);
  const same = (m) => { const was = before.find((b) => b.id === m.id); return !!was && JSON.stringify(was) === asEntry(m); };
  const touched = changed.includes('scripts/mutants.cjs') ? mutants : mutants.filter((m) => !same(m) || changed.some((c) => standsOn(m, c)));
  if (!standing) return Object.assign(touched, { stood: 0 });
  const kept = results ?? readResults();
  const ctx = context ?? standingContext();
  const left = touched.filter((m) => whyNotStanding(m, kept.find((r) => r.mutant === m.id), ctx) !== null);
  return Object.assign(left, { stood: touched.length - left.length });
};

/**
 * The results file of a merge: each public mutant of the merged registry once, in its order, its verdict
 * from either side: the one that still stands on the merged files (`whyNot`), else the later run of the two
 * (`later(a, b)`: a's commit holds b's in its history), else ours. A mutant neither side ran is left out, so it runs.
 */
const mergeResults = (ours, theirs, mutants, whyNot, later = () => false) => mutants.filter((m) => !m.private).flatMap((m) => {
  const sides = [ours.find((r) => r.mutant === m.id), theirs.find((r) => r.mutant === m.id)].filter(Boolean);
  const standing = sides.filter((r) => whyNot(m, r) === null);
  const [a, b] = sides;
  return sides.length ? [keep(standing[0] ?? (b && later(b, a) ? b : a))] : [];
});

/**
 * A merge in hand (commit.cjs --merge, before its commit): the results file written as mergeResults
 * makes it, from HEAD's and MERGE_HEAD's, against the merged registry in the working files. Says how
 * many stand; throws while the registry itself is not merged.
 */
const resolveMergedResults = (root = ROOT) => {
  const show = (rev) => { try { return JSON.parse(execFileSync('git', ['show', `${rev}:mobile/register/mutant-results.json`], { cwd: root, encoding: 'utf8', maxBuffer: 1e9, stdio: ['ignore', 'pipe', 'pipe'] })); } catch { return []; } };
  const text = readFileSync(join(root, 'mobile', 'register', 'mutants.yaml'), 'utf8');
  if (/^(?:<{7}|>{7}) /m.test(text)) throw new Error('register/mutants.yaml is not merged: resolve it first');
  const mutants = yaml.parse(text).mutants ?? [];
  const ctx = standingContext(null, root);
  const merged = mergeResults(show('HEAD'), show('MERGE_HEAD'), mutants, (m, r) => whyNotStanding(m, r, ctx),
    (a, b) => a.commit !== b.commit && ancestor(b.commit, a.commit, root));
  writeFileSync(join(root, 'mobile', 'register', 'mutant-results.json'), `${JSON.stringify(merged, null, 2)}\n`);
  const stand = merged.filter((r) => whyNotStanding(mutants.find((m) => m.id === r.mutant), r, ctx) === null).length;
  return { mutants: mutants.length, stand };
};

/** Part i of n: every n-th mutant from the i-th, so each part holds every kind. */
const partOf = (mutants, spec) => {
  const [i, n] = spec.split('/').map(Number);
  if (!(n >= 1 && i >= 1 && i <= n)) throw new Error(`--part wants i/n, as 2/3 (has ${spec})`);
  return mutants.filter((_, k) => k % n === i - 1);
};

/** Results kept: ids and verdicts only (P0.39), each mutant once, in the registry's order. */
const RESULT_KEYS = ['class', 'mutant', 'proof', 'commit', 'verdict'];
const keep = (r) => Object.fromEntries(RESULT_KEYS.map((k) => [k, r[k]]));

/**
 * The count-only file after a run: the public mutants it ran (`ran`, each `keep`'s shape) replace their
 * entries, the others' are kept (none with `fresh`), each once in the registry's order (`all`).
 */
const writeResults = (out, ran, all, fresh = false) => {
  const kept = existsSync(out) && !fresh ? JSON.parse(readFileSync(out, 'utf8')) : [];
  const merged = all.filter((m) => !m.private).map((m) => ran.find((r) => r.mutant === m.id) ?? kept.find((r) => r.mutant === m.id)).filter(Boolean);
  writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
};

/** A run's fuller record: each verdict's ids, its source, its test file and title (or its judge), and why, whole. */
const fullRecord = (results) => results.map(({ m, ...r }) => ({ ...keep(r), source: m.source, test: m.proof ? `${m.proof.file}: ${m.proof.test}` : m.judge.run.slice(1, 2).join(''), why: r.why }));

/** One results file from the parts' files: each public mutant exactly once, or what is wrong, in words. */
const gather = (parts, mutants) => {
  const all = parts.flat();
  const ids = mutants.filter((m) => !m.private).map((m) => m.id);
  const faults = [
    ...ids.filter((id) => !all.some((r) => r.mutant === id)).map((id) => `${id}: no part ran it`),
    ...ids.filter((id) => all.filter((r) => r.mutant === id).length > 1).map((id) => `${id}: run by more than one part`),
    ...all.filter((r) => !ids.includes(r.mutant)).map((r) => `${r.mutant}: not in the registry`),
  ];
  const results = ids.map((id) => all.find((r) => r.mutant === id)).filter(Boolean).map(keep);
  return { results, faults };
};

/**
 * `fn` run while this process alone holds the lock (a folder made only if none is there), waited for
 * up to a minute; a lock older than that was left by a run that ended and is taken over.
 */
const withLock = (lock, fn, wait = 60_000) => {
  const from = Date.now();
  for (;;) {
    try { mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let old = false;
      try { old = Date.now() - statSync(lock).mtimeMs > wait; } catch { /* let go between the two looks: try again */ }
      if (old) { rmSync(lock, { recursive: true, force: true }); continue; }
      if (Date.now() - from > wait) throw new Error(`${lock} was held for a minute`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
};

/** The private folder of the main checkout, where the fuller record is kept (P0.54); null when there is none. */
const privateDir = () => {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: MOBILE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const dir = join(common, '..', 'mobile', 'audit', 'final', 'private');
    return existsSync(dir) ? dir : null;
  } catch { return null; }
};

/** A run's fuller record (fullRecord) kept in the private folder under its commit, beside what is there: one writer at a time. */
const writePrivate = (full, commit, priv = privateDir()) => {
  if (!priv || !full.length) return;
  const dir = join(priv, 'mutants');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${commit}.json`);
  // The push's mutant lanes (scripts/hooks/mutant-lanes.cjs) end side by side.
  withLock(`${file}.lock`, () => {
    const had = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
    writeFileSync(file, `${JSON.stringify([...had.filter((h) => !full.some((f) => f.mutant === h.mutant)), ...full], null, 2)}\n`);
  });
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const refused = argumentsFault(argv);
  if (refused) { console.error(refused); process.exit(2); }
  const arg = (name) => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
  const left = putBackLeftover();
  if (left.length) console.log(`put back what a stopped run left in place: ${left.join(', ')}`);
  if (argv.includes('--put-back')) process.exit(0);
  // A run of mutants fills the machine: never beside a push gate but as its own (gate-lock.cjs); --gather only reads.
  if (!argv.includes('--gather')) require('./gate-lock.cjs').refuseWhileGate('a mutants run');
  const all = readMutants();
  const { aside, bare } = readPrivate();
  if (bare.length) { console.error(bareRefusal(bare)); process.exit(2); }
  if (aside.length) console.log(`${aside.length} private mutant(s) set aside: the commit each names (since) is not in this checkout's history`);

  if (argv.includes('--gather')) {
    const dir = arg('--gather');
    const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
    const { results, faults } = gather(files.map((f) => JSON.parse(readFileSync(f, 'utf8'))), all);
    writeFileSync(arg('--out'), `${JSON.stringify(results, null, 2)}\n`);
    const bad = results.filter((r) => r.verdict !== 'caught');
    for (const f of faults) console.log(`✗ ${f}`);
    for (const r of bad) console.log(`✗ ${r.mutant} (${r.class}): ${r.verdict}`);
    console.log(`${files.length} part(s), ${results.length - bad.length} of ${all.filter((m) => !m.private).length} mutants caught`);
    process.exit(faults.length || bad.length ? 1 : 0);
  }

  // --ids @<file>: the ids one per line, as many as a command line could not hold.
  const ids = arg('--ids')?.startsWith('@') ? readFileSync(arg('--ids').slice(1), 'utf8').split(/\r?\n/).filter(Boolean) : arg('--ids')?.split(',');
  let chosen = ids ? all.filter((m) => ids.includes(m.id)) : all;
  if (ids && chosen.length !== ids.length) { console.error(`no such mutant: ${ids.filter((i) => !all.some((m) => m.id === i)).join(', ')}`); process.exit(2); }
  if (arg('--changed')) {
    chosen = touchedSince(arg('--changed'), chosen, { standing: !argv.includes('--rerun') });
    console.log(`${chosen.length} of ${all.length} mutants stand on what changed since ${arg('--changed').slice(0, 8)} and have no verdict that still stands`
      + `${chosen.stood ? ` (${chosen.stood} more stand by a verdict recorded at a commit in this history, nothing they stand on changed since: not run again)` : ''}`);
  }
  if (arg('--part')) chosen = partOf(chosen, arg('--part'));
  if (arg('--types-out')) {
    // The warm checker: each chosen mutant's type check, in memory from the committed build, one line
    // each as it ends; nothing written to the checkout. The run that reads it is told by --types-from.
    const out = arg('--types-out');
    const warm = warmTypes();
    // The commit's own type errors first: the push takes them as its types check.
    appendFileSync(out, `${JSON.stringify({ atCommit: warm.atCommit })}\n`);
    console.log(`the warm checker: ${warm.atCommit.length} type errors at this commit`);
    for (const m of chosen) {
      if (m.source === 'judge') continue;
      const plan = changesOf(m);
      if (plan.notApplied || !typed(plan.changes) || !warm.holds(plan.changes)) continue;
      const t0 = Date.now();
      appendFileSync(out, `${JSON.stringify({ id: m.id, hash: changesHash(plan.changes), faults: warm.check(plan.changes), ms: Date.now() - t0 })}\n`);
    }
    appendFileSync(out, `${JSON.stringify({ done: true })}\n`);
    process.exit(0);
  }
  const register = require('./register.cjs');
  let classes = register.readCommitted().classes;
  try { const joined = register.readPrivate?.(); if (joined?.classes) classes = [...classes, ...joined.classes]; } catch { /* public only */ }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: MOBILE, encoding: 'utf8' }).trim();
  const results = [];
  // Ctrl+C ends the run after the mutant in hand is put back, never with it in.
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; console.error('stopping once this mutant is put back'); });
  // Reports of a jest run of this same tree: a mutant whose test they hold green skips its own first run.
  const green = (arg('--green')?.split(',') ?? []).map((f) => JSON.parse(readFileSync(f, 'utf8')));
  // A warm checker's answers, taken only where made from the same bytes (typesFrom).
  const types = arg('--types-from') ? typesFrom(arg('--types-from')) : null;
  // A mutant's kept `caught`, taken where every byte it stands on is as it was (mutantState); --rerun runs every one.
  const verdicts = require('./hooks/verdicts.cjs');
  const book = verdicts.bookFile('mutants');
  const tools = verdicts.toolsNow();
  for (const m of chosen) {
    if (stopping) break;
    const t0 = Date.now();
    const state = mutantState(m, ROOT, tools);
    const kept = argv.includes('--rerun') ? null : verdicts.lookup(verdicts.readBook(book), m.id, state.key);
    const { verdict, why } = kept ? { verdict: 'caught', why: verdicts.whyValid(m.id, kept) } : runOne(m, green, types);
    if (!kept) {
      withLock(`${book}.lock`, () => verdicts.writeBook(book, verdicts.remember(verdicts.readBook(book), m.id, { ...state, verdict, commit })));
    }
    console.log(`${verdict.padEnd(11)} ${m.private ? '(private)' : m.id}  ${m.private ? '' : m.class}  ${Math.round((Date.now() - t0) / 1000)}s${why && !m.private ? `  — ${why}` : ''}`);
    results.push({ class: m.class, mutant: m.id, proof: m.source === 'judge' ? 'judge' : proofId(m, classes), commit, verdict, private: !!m.private, why, m });
  }
  // The count-only file: a run of some mutants replaces their entries and keeps the others'.
  if (arg('--results')) writeResults(arg('--results'), results.filter((r) => !r.private).map(keep), all, argv.includes('--fresh'));
  // The fuller record, in the private folder: source, the test file and title, and why (P0.72); with
  // --record, its public part in that file too (a machine with no private folder: mutants-remote.cjs).
  writePrivate(fullRecord(results), commit);
  if (arg('--record')) writeFileSync(arg('--record'), `${JSON.stringify(fullRecord(results.filter((r) => !r.private)), null, 2)}\n`);
  const bad = results.filter((r) => r.verdict !== 'caught');
  if (typeAnswers.warm + typeAnswers.tsc) console.log(`type checks: ${typeAnswers.warm} by the warm checker from the same bytes, ${typeAnswers.tsc} by tsc`);
  console.log(`\n${results.length - bad.length} of ${results.length} caught`);
  process.exit(bad.length ? 1 : 0);
}

module.exports = {
  applyEdits, argumentsFault, atNormalPriority, changesHash, changesOf, verdictOf, gather, greenIn, hunksOf, lf, partOf, pathsOf, PLACED, privateDir, proofId, putBackLeftover,
  compileFaults, mutantState, readMutants, really, REHEARSAL, testArgs, reverse, runOne, standsOn, statusIn, syntaxFaults, touchedSince, typesFrom, warmTypes, withLock,
  ancestor, bareRefusal, errorWords, fullRecord, keep, mergeResults, privateHalf, readPrivate, readResults, resolveMergedResults, standingContext, whyNotStanding, writePrivate, writeResults,
};
