/**
 * scripts/private-settings.cjs: once a script reads a private value, an error it does not catch
 * is printed with that value hidden. A failed child process's error names its whole command, the
 * database address and its password among it.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

const SETTINGS = join(__dirname, '..', 'private-settings.cjs');
// In pieces, so the secrets scan does not take the planted address for a real one.
const PLANTED = `${'postgres' + 'ql://'}reader:planted-password@127.0.0.1:1/postgres`;

/** A script that reads the planted address, then fails as `failure` says; its output and exit. */
const fails = (failure: string) => {
  const script = `const { readPrivate } = require(${JSON.stringify(SETTINGS)});
const url = readPrivate('SUPABASE_DB_URL');
${failure}`;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: { ...process.env, SUPABASE_DB_URL: PLANTED } });
  return { out: `${r.stdout}${r.stderr}`, status: r.status };
};

it('hides a value read from an error nobody catches, and still ends the script', () => {
  const { out, status } = fails('throw new Error(`Command failed: psql ${url} -c select 1`);');
  expect(status).toBe(1);
  expect(out).toContain('Command failed: psql *** -c select 1');
  expect(out).not.toContain('planted-password');
});

it('hides it from a promise nobody waits for', () => {
  const { out, status } = fails('Promise.reject(new Error(`could not reach ${url}`));');
  expect(status).toBe(1);
  expect(out).toContain('could not reach ***');
  expect(out).not.toContain('planted-password');
});

it('hides it from a value thrown that is not an Error', () => {
  const { out, status } = fails('throw `no answer from ${url}`;');
  expect(status).toBe(1);
  expect(out).toContain('no answer from ***');
  expect(out).not.toContain('planted-password');
});

it('leaves a script that read nothing to end as Node ends it', () => {
  const r = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(SETTINGS)}); throw new Error('plain')`], { encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stderr).toContain('Error: plain');
});
