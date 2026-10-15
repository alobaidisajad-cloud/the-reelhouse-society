/**
 * oldClients.test.ts — e2e/db/old-clients.mjs says a shipped client breaks
 * only when its own schema tests fail; a client it could not set up is said
 * to be unchecked, naming the step, and its install is tried once more.
 */
import { pathToFileURL } from 'url';
import { join } from 'path';
import { spawnSync } from 'child_process';

const SCRIPT = pathToFileURL(join(__dirname, '..', 'db', 'old-clients.mjs')).href;

/** Runs the script's own functions in node (an ES module), with each command's status scripted. */
function check(statuses: Record<string, number[]>, fresh = true) {
  const code = `
    const { checkClient, summary } = await import(${JSON.stringify(SCRIPT)});
    const statuses = ${JSON.stringify(statuses)};
    const calls = [];
    const run = (cmd, args) => { const k = cmd + ' ' + args[0]; calls.push(k); const s = statuses[k] ?? [0]; return s.length > 1 ? s.shift() : s[0]; };
    const r = { name: 'build 41', ...checkClient({ fresh: ${fresh}, run, lay: () => calls.push('lay') }) };
    console.log(JSON.stringify({ r, calls, s: summary([r]) }));`;
  const out = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(out.stderr).toBe('');
  return JSON.parse(out.stdout) as { r: { verdict: string; step?: string }; calls: string[]; s: { lines: string[]; ok: boolean } };
}

it('a client whose schema tests pass holds', () => {
  const { r, calls, s } = check({});
  expect(r.verdict).toBe('held');
  expect(calls).toEqual(['git fetch', 'git worktree', 'lay', 'npm ci', 'npx jest']);
  expect(s).toEqual({ ok: true, lines: ["✓ 1 client(s) in members' hands ask only for what production will have."] });
});

it('only its failing schema tests say production breaks it', () => {
  const { r, s } = check({ 'npx jest': [1] });
  expect(r.verdict).toBe('breaks');
  expect(s).toEqual({ ok: false, lines: ['✗ Production as it will be breaks: build 41'] });
});

it('an install that fails once is tried once more, and the client is judged', () => {
  const { r, calls } = check({ 'npm ci': [1, 0] });
  expect(r.verdict).toBe('held');
  expect(calls.filter((c) => c === 'npm ci')).toHaveLength(2);
});

it('an install that fails twice leaves the client unchecked, and says so, never that it breaks', () => {
  const { r, calls, s } = check({ 'npm ci': [1, 1] });
  expect(r).toEqual({ name: 'build 41', verdict: 'unchecked', step: 'installing its packages (tried twice)' });
  expect(calls).not.toContain('npx jest');
  expect(s).toEqual({ ok: false, lines: ['✗ Not checked, so not known to hold: build 41 (installing its packages (tried twice))'] });
  expect(s.lines.join()).not.toContain('breaks');
});

it('a commit it could not fetch or check out is unchecked, by that step', () => {
  expect(check({ 'git fetch': [128] }).r).toEqual({ name: 'build 41', verdict: 'unchecked', step: 'fetching its commit' });
  expect(check({ 'git worktree': [128] }).r).toEqual({ name: 'build 41', verdict: 'unchecked', step: 'checking out its commit' });
});

it('a checkout already made is used as it is', () => {
  expect(check({}, false).calls).toEqual(['lay', 'npm ci', 'npx jest']);
});
