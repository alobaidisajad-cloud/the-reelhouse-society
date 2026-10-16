#!/usr/bin/env node
/**
 * resume — where the work stands, read from the repository, never from memory
 * (WORKLIST P0.59). Every working session starts by running it.
 *
 *   node mobile/scripts/resume.cjs           the status, and each journal's header rewritten
 *   node mobile/scripts/resume.cjs --no-ci   the same, without asking GitHub
 *
 * It prints: the commit checked out against main's, and what is not committed;
 * the migrations still pending (not in APPLIED.txt) for the next train; each
 * workflow's last result for this commit; and the register's open classes,
 * the next first (open in production, then by seriousness, then by count),
 * each with its finders (its methods) and its proofs.
 *
 * One journal per area lives in the private audit folder (journals/<area>.md),
 * found through git's common directory so every worktree reads and writes the
 * same ones. resume rewrites each journal's status header (its classes, each
 * with status and count) and keeps what is written below it.
 */
const { execFileSync } = require('child_process');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { basename, join } = require('path');
const { readCommitted, readPrivate } = require('./register.cjs');
const universe = require('../test-utils/universe');

const MOBILE = join(__dirname, '..');
const ROOT = join(MOBILE, '..');
const SERIOUSNESS = ['serious', 'behaviour', 'layout', 'code'];
const DONE = ['CLOSED', 'OUT_OF_SCOPE'];
const HEADER_START = '<!-- status: written by mobile/scripts/resume.cjs; what is below the closing line is kept -->';
const HEADER_END = '<!-- /status -->';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** The private audit folder, in the main checkout, whichever worktree asks. */
const privateDir = (commonDir) => join(commonDir, '..', 'mobile', 'audit', 'final', 'private');

/** The register's classes, joined with their private halves where those exist. */
const classes = () => {
  const priv = readPrivate();
  const byId = new Map((priv?.classes ?? []).map((c) => [c.id, c]));
  return readCommitted().classes.map((c) => ({ ...c, ...(byId.get(c.id) ?? {}) }));
};

/** The open classes, the next first: open in production, then the most serious, then the most cases. */
const nextOpen = (all) => all
  .filter((c) => !DONE.includes(c.status ?? 'OPEN'))
  .sort((a, b) => Number(!!b.open_in_production) - Number(!!a.open_in_production)
    || SERIOUSNESS.indexOf(a.seriousness) - SERIOUSNESS.indexOf(b.seriousness)
    || (b.count ?? 0) - (a.count ?? 0)
    || a.id.localeCompare(b.id));

/** A journal's status header for one area's classes. */
const headerFor = (area, inArea, today) => [
  HEADER_START,
  `# ${area}`,
  '',
  `Status on ${today}: ${inArea.length} class(es), ${inArea.filter((c) => !DONE.includes(c.status ?? 'OPEN')).length} not done.`,
  '',
  ...inArea.map((c) => `- ${c.id}: ${c.status ?? 'OPEN'}, ${c.count}${c.open_in_production ? ', open in production' : ''}`),
  HEADER_END,
].join('\n');

/** A journal with its header replaced, and everything written below it kept. */
const withHeader = (journal, header) => {
  const end = journal.indexOf(HEADER_END);
  const below = end === -1 ? journal : journal.slice(end + HEADER_END.length);
  return `${header}${below.startsWith('\n') ? below : `\n\n${below}`}`;
};

/** The pending migrations: every migration (the shared file list's, as up-down-up.mjs reads it) APPLIED.txt does not name. */
const pending = () => {
  const applied = new Set(readFileSync(join(MOBILE, 'supabase', 'APPLIED.txt'), 'utf8')
    .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
  return universe.files('migrations').map((p) => basename(p)).filter((n) => !applied.has(n)).sort();
};

if (require.main === module) {
  const today = new Date().toISOString().slice(0, 10);
  const head = git('rev-parse', 'HEAD');
  let behind = '';
  try { behind = git('rev-list', '--left-right', '--count', 'HEAD...origin/main'); } catch { /* no origin */ }
  const [ahead, back] = behind.split(/\s+/).map(Number);
  const dirty = git('status', '--porcelain').split('\n').filter((l) => l && !l.startsWith('??')).length;

  console.log(`HEAD ${head.slice(0, 8)}: ${ahead ?? '?'} ahead of origin/main, ${back ?? '?'} behind; ${dirty} changed file(s) not committed.`);

  const waiting = pending();
  console.log(`\nThe next train: ${waiting.length} pending migration(s)${waiting.length ? `\n  ${waiting.join('\n  ')}` : '.'}`);

  if (!process.argv.includes('--no-ci')) {
    try {
      const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--commit', head, '--json', 'name,status,conclusion'], { cwd: ROOT, encoding: 'utf8' }));
      const shown = runs.filter((r) => !/CI alert/.test(r.name));
      console.log(`\nThis commit's workflows: ${shown.length ? '' : 'none yet (not pushed, or not started)'}`);
      for (const r of shown) console.log(`  ${r.status === 'completed' ? r.conclusion : r.status}  ${r.name}`);
    } catch (e) {
      const said = String(e.stderr || e.message).trim().split('\n')[0];
      console.log(`\nThis commit's workflows: GitHub could not be asked (gh: ${said}); run with --no-ci to skip.`);
    }
  }

  const all = classes();
  const open = nextOpen(all);
  console.log(`\nThe register: ${all.length} classes, ${open.length} not done. Next:`);
  for (const c of open.slice(0, 8)) {
    const finders = (c.methods ?? []).map((m) => `${m.kind} ${m.file}`).join('; ') || 'no finder yet';
    const proofs = Object.entries(c.proofs ?? {}).map(([k, v]) => `${k} ${v?.result ?? '?'}`).join(', ') || 'no proofs yet';
    console.log(`  ${c.id} (${c.area}, ${c.seriousness}, ${c.count}${c.open_in_production ? ', open in production' : ''})\n    finders: ${finders}\n    proofs: ${proofs}`);
  }

  let common;
  try { common = git('rev-parse', '--path-format=absolute', '--git-common-dir'); } catch { common = null; }
  if (!common || !readPrivate()) {
    console.log('\nThe journals: no private audit folder here (the main checkout holds it).');
  } else {
    const dir = join(privateDir(common), 'journals');
    mkdirSync(dir, { recursive: true });
    const areas = [...new Set(all.map((c) => c.area))].sort();
    for (const area of areas) {
      const file = join(dir, `${area}.md`);
      const was = existsSync(file) ? readFileSync(file, 'utf8') : '';
      writeFileSync(file, withHeader(was, headerFor(area, all.filter((c) => c.area === area), today)));
    }
    console.log(`\nThe journals: ${areas.length} headers written (${dir}).`);
  }
}

module.exports = { HEADER_END, HEADER_START, headerFor, nextOpen, pending, privateDir, withHeader };
