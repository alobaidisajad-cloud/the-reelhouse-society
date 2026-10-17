/**
 * startStack.test.ts — e2e/start-stack.sh, run in bash against a fake
 * `supabase`, `sudo`, `sysctl` and `ss`: the stack's ports are reserved and
 * waited for; the runner's Docker failing to wire a container is tried once
 * more and said; every other failure stops the run at once, and the three
 * sealed workflows all start through it.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
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
  inuse) echo 'failed to start docker container "supabase_inbucket_reelhouse-e2e": Error response from daemon: failed to bind host port for 0.0.0.0:54324:172.18.0.5:8025/tcp: address already in use'; exit 1 ;;
  *) echo "failed to read config.toml: functions.sign-in-with-username: no such function"; exit 1 ;;
esac
`;

// sudo runs what it is given, or refuses (__T__/sudo-refuses).
const SUDO = `#!/usr/bin/env bash
[ -f __T__/sudo-refuses ] && exit 1
[ "$1" = "-n" ] && shift
"$@"
`;
// The kernel's reserved list: read from, and written to, __T__/reserved.
const SYSCTL = `#!/usr/bin/env bash
case "$1" in
  -n) cat __T__/reserved 2>/dev/null ;;
  -qw) echo "\${2#*=}" > __T__/reserved ;;
esac
`;
// Another connection holds port 54324 for the next (__T__/holds) looks.
const SS = `#!/usr/bin/env bash
echo "ESTAB 0 0 10.1.0.4:41234 140.82.112.4:443"
n=$(cat __T__/holds 2>/dev/null || echo 0)
if [ "$n" -gt 0 ]; then
  echo "ESTAB 0 0 10.1.0.4:54324 140.82.112.4:443"
  echo $((n - 1)) > __T__/holds
fi
`;

type Machine = { holds?: number; reserved?: string; sudoRefuses?: boolean; wait?: number; extra?: string };

function start(starts: string[], o: Machine = {}) {
  const T = posix(mkdtempSync(join(tmpdir(), 'start-stack-')));
  mkdirSync(join(T, 'bin'));
  for (const [name, body] of [['supabase', SUPABASE], ['sudo', SUDO], ['sysctl', SYSCTL], ['ss', SS]]) {
    writeFileSync(join(T, 'bin', name), body.replace(/__T__/g, T), { mode: 0o755 });
  }
  writeFileSync(join(T, 'starts'), `${starts.join('\n')}\n`);
  if (o.holds) writeFileSync(join(T, 'holds'), String(o.holds));
  if (o.reserved) writeFileSync(join(T, 'reserved'), o.reserved);
  if (o.sudoRefuses) writeFileSync(join(T, 'sudo-refuses'), '');
  const r = spawnSync(BASH, [posix(SCRIPT), 'studio,imgproxy', 'The rehearsal stack'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(T, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
      RUNNER_TEMP: T, GITHUB_STEP_SUMMARY: `${T}/summary.md`, STACK_PORT_WAIT: String(o.wait ?? 5),
      ...(o.extra ? { STACK_EXTRA_PORTS: o.extra } : {}),
    },
  });
  const read = (f: string) => (existsSync(join(T, f)) ? readFileSync(join(T, f), 'utf8').trim() : '');
  const calls = read('calls').split('\n');
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls, reserved: read('reserved'), holds: read('holds') };
}

/** Every port config.toml gives the stack. */
const PORTS = [...readFileSync(join(MOBILE, 'e2e', 'supabase', 'config.toml'), 'utf8').matchAll(/^[a-z_]*port = (\d+)/gm)]
  .map((m) => Number(m[1])).sort((a, b) => a - b).join(',');

describe('the stack’s ports are kept from the machine’s own connections', () => {
  it('reserves every port config.toml names, beside any already reserved', () => {
    expect(PORTS.split(',').length).toBeGreaterThanOrEqual(4);
    expect(PORTS).toContain('54321');
    expect(start(['ok']).reserved).toBe(PORTS);
    expect(start(['ok'], { reserved: '8125' }).reserved).toBe(`8125,${PORTS}`);
  });

  it('reserves the ports the workflow names beside them, once each, in order (run 39016138220)', () => {
    const all = [...PORTS.split(','), '54330', '54331'].map(Number).sort((a, b) => a - b).join(',');
    expect(start(['ok'], { extra: '54331,54330' }).reserved).toBe(all);
    expect(start(['ok'], { extra: `${PORTS.split(',')[0]},54330,54331` }).reserved).toBe(all);
  });

  it('waits for a connection that holds one of them to let it go, then starts', () => {
    const r = start(['ok'], { holds: 2 });
    expect([r.status, r.calls, r.holds]).toEqual([0, ['start -x studio,imgproxy'], '0']);
    expect(r.stdout).not.toMatch(/^::/m);
  });

  it('a port still held when the wait ends is said, and the start is tried', () => {
    const r = start(['ok'], { holds: 99, wait: 1 });
    expect([r.status, r.calls]).toEqual([0, ['start -x studio,imgproxy']]);
    expect(r.stdout).toMatch(/^::warning title=The rehearsal stack — a port it needs was still held after 1 s::still held: 54324/m);
  });

  it('a kernel that will not reserve them is said, and the start goes on', () => {
    const r = start(['ok'], { sudoRefuses: true });
    expect([r.status, r.reserved]).toEqual([0, '']);
    expect(r.stdout).toMatch(/^::warning title=The rehearsal stack — its ports could not be reserved::/m);
  });

  it('a port taken as the stack starts: stopped, waited for, started once more', () => {
    const r = start(['inuse', 'ok']);
    expect([r.status, r.calls]).toEqual([0, ['start -x studio,imgproxy', 'stop --no-backup', 'start -x studio,imgproxy']]);
  });
});

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

  it('keeps for the E2E stack the very ports e2e.yml starts the fault proxy on', () => {
    const text = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'e2e.yml'), 'utf8');
    const extra = /STACK_EXTRA_PORTS: ([\d,]+)/.exec(text)?.[1]?.split(',').sort();
    const proxy = /fault-proxy\.mjs --listen (\d+) --to \S+ --control (\d+)/.exec(text)?.slice(1).sort();
    expect(proxy).toHaveLength(2);
    expect(extra).toEqual(proxy);
  });
});
