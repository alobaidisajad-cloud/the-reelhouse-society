/**
 * startStack.test.ts — e2e/start-stack.sh, run in bash against a fake
 * `supabase`: the runner's Docker failing to wire a container is tried once
 * more and said; every other failure stops the run at once, and the three
 * sealed workflows all start through it.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MOBILE } from '../../test-utils/readCode';

const BASH = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const SCRIPT = join(MOBILE, 'e2e', 'start-stack.sh');
const posix = (p: string) => p.replace(/\\/g, '/');

// Each `supabase start` takes its next outcome from starts: ok, fault (the runner) or broken.
const SUPABASE = `#!/usr/bin/env bash
echo "$*" >> __T__/calls
[ "$1" = "start" ] || exit 0
n=$(( $(cat __T__/n 2>/dev/null || echo 0) + 1 )); echo $n > __T__/n
case "$(sed -n "\${n}p" __T__/starts)" in
  ok) echo "Started supabase local development setup."; exit 0 ;;
  fault) echo 'failed to start docker container "supabase_db_reelhouse-e2e": Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint supabase_db_reelhouse-e2e'; exit 1 ;;
  *) echo "failed to read config.toml: functions.sign-in-with-username: no such function"; exit 1 ;;
esac
`;

function start(starts: string[]) {
  const T = posix(mkdtempSync(join(tmpdir(), 'start-stack-')));
  mkdirSync(join(T, 'bin'));
  writeFileSync(join(T, 'bin', 'supabase'), SUPABASE.replace(/__T__/g, T), { mode: 0o755 });
  writeFileSync(join(T, 'starts'), `${starts.join('\n')}\n`);
  const r = spawnSync(BASH, [posix(SCRIPT), 'studio,imgproxy', 'The rehearsal stack'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(T, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
      RUNNER_TEMP: T, GITHUB_STEP_SUMMARY: `${T}/summary.md`,
    },
  });
  const calls = readFileSync(join(T, 'calls'), 'utf8').trim().split('\n');
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls };
}

describe('the stack starts once, or once more only when the runner was at fault', () => {
  it('starts, and says nothing more', () => {
    const r = start(['ok']);
    expect([r.status, r.calls]).toEqual([0, ['start -x studio,imgproxy']]);
    expect(r.stdout).not.toMatch(/^::/m);
  });

  it('the runner failing to wire a container: stopped, started once more, and said', () => {
    const r = start(['fault', 'ok']);
    expect([r.status, r.calls]).toEqual([0, ['start -x studio,imgproxy', 'stop --no-backup', 'start -x studio,imgproxy']]);
    expect(r.stdout).toContain(
      "\n::notice title=The rehearsal stack started once more (the runner's Docker could not wire a container)::",
    );
  });

  it('the runner failing twice stops the run, by name', () => {
    const r = start(['fault', 'fault']);
    expect(r.status).toBe(1);
    expect(r.calls.filter((c) => c.startsWith('start'))).toHaveLength(2);
    expect(r.stdout).toMatch(/^::error title=The rehearsal stack would not start::/m);
  });

  it('any other failure stops the run at once, never tried again', () => {
    const r = start(['broken', 'ok']);
    expect([r.status, r.calls]).toEqual([1, ['start -x studio,imgproxy']]);
    expect(r.stdout).toMatch(/^::error title=The rehearsal stack would not start::.*no such function/m);
  });

  it('runs in bash as stored, and every sealed workflow starts through it', () => {
    expect(readFileSync(SCRIPT, 'utf8')).not.toContain('\r');
    for (const wf of ['db-integration.yml', 'e2e.yml', 'load.yml']) {
      const text = readFileSync(join(MOBILE, '..', '.github', 'workflows', wf), 'utf8');
      expect(text).toContain('bash mobile/e2e/start-stack.sh ');
      expect(text).not.toMatch(/supabase start -x/);
    }
  });
});
