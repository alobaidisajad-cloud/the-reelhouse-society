/**
 * heartbeatsAreKept.test.ts — every schedule says it ran, to a monitor outside GitHub (WORKLIST P0.38).
 *
 * GitHub stops a repository's schedules after 60 days without activity and sends nothing. Each
 * scheduled workflow carries a heartbeat job that checks in (scripts/heartbeat.mjs) with the
 * monitor register/alert-rules.json names for it, on the same schedule; a new scheduled workflow
 * without one fails here, as does a rule whose workflow no longer runs on that schedule.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { files as universe } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..');
const RULES = JSON.parse(readFileSync(join(MOBILE, 'register', 'alert-rules.json'), 'utf8')) as {
  heartbeats: { monitor: string; workflow: string; cron: string; margin_minutes: number }[];
};
const workflows = universe('workflows').filter((p) => /\.ya?ml$/.test(p))
  .map((p) => ({ name: p.split(/[\\/]/).pop() as string, text: readFileSync(p, 'utf8').replace(/\r\n/g, '\n') }));
const scheduled = workflows.filter((w) => /\n\s+schedule:\n\s+- cron:/.test(w.text));

it('reads the workflows — it is not passing on none', () => {
  expect(scheduled.length).toBeGreaterThanOrEqual(6);
});

it('every scheduled workflow has its heartbeat, on its own schedule', () => {
  const crons = (text: string) => [...text.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]);
  expect(scheduled.map((w) => w.name).sort()).toEqual(RULES.heartbeats.map((h) => h.workflow).sort());
  for (const h of RULES.heartbeats) {
    const w = scheduled.find((x) => x.name === h.workflow);
    expect([h.workflow, crons(w?.text ?? '').includes(h.cron)]).toEqual([h.workflow, true]);
  }
});

/** The heartbeat job's own text: from its key to the next job's, or the file's end. */
const heartbeatJob = (text: string) => {
  const from = text.indexOf('\n  heartbeat:\n');
  if (from < 0) return '';
  const next = text.slice(from + 1).search(/\n  [\w-]+:\n/);
  return next < 0 ? text.slice(from) : text.slice(from, from + 1 + next + 1);
};

it('and each checks in, only when the schedule fired, by the monitor the rules name', () => {
  for (const h of RULES.heartbeats) {
    const job = heartbeatJob(scheduled.find((x) => x.name === h.workflow)?.text ?? '');
    // Its own schedule by its own time: a workflow another one calls takes the caller's event, and its
    // caller's schedule must never check in for it. Or a time the wake task carried, checked first.
    const when = `    if: (github.event_name == 'schedule' && github.event.schedule == '${h.cron}') || inputs.wake_night\n`;
    expect([h.workflow, job.includes(when), job.includes(`node mobile/scripts/heartbeat.mjs ${h.monitor}\n`)])
      .toEqual([h.workflow, true, true]);
    expect([h.workflow, /HEARTBEAT_CHECKIN_URL: \$\{\{ secrets\.HEARTBEAT_CHECKIN_URL \}\}/.test(job)]).toEqual([h.workflow, true]);
    const verify = `      - name: The time the wake task carried, checked\n        if: inputs.wake_night\n        env:\n          WAKE_NIGHT: \${{ inputs.wake_night }}\n` +
      `        run: node mobile/scripts/wake.mjs --verify ${h.workflow} "$WAKE_NIGHT"\n      - name: Check in\n`;
    expect([h.workflow, job.includes(verify), job.includes('            mobile/scripts/wake.mjs\n')]).toEqual([h.workflow, true, true]);
  }
});

/** A schedule's minute, where GitHub is busiest: the hour, and its quarters, where most schedules sit. */
const onABusyMinute = (cron: string) => Number(cron.split(' ')[0]) % 15 === 0;

it('every schedule sits off the hour and its quarters, each at its own time', () => {
  expect(RULES.heartbeats.filter((h) => onABusyMinute(h.cron)).map((h) => `${h.workflow} ${h.cron}`)).toEqual([]);
  expect(new Set(RULES.heartbeats.map((h) => h.cron.split(' ').slice(0, 2).join(' '))).size).toBe(RULES.heartbeats.length);
  expect([onABusyMinute('0 3 * * *'), onABusyMinute('30 2 * * *'), onABusyMinute('17 3 * * *')]).toEqual([true, true, false]);
});

it('a run the wake task starts carries its time by input and by name, and the night\'s history reads such a night', () => {
  // Quoted whole in the workflow: its words hold ": ", which YAML would read as a mapping.
  const runName = `run-name: "\${{ inputs.wake_night && format('Carried by the wake task: {0}', inputs.wake_night) || '' }}"\n`;
  for (const w of scheduled) {
    const dispatch = w.text.slice(w.text.indexOf('\n  workflow_dispatch:\n'), w.text.indexOf('\n  workflow_dispatch:\n') + 2000);
    expect([w.name, w.text.includes(runName), /\n {6}wake_night:\n {8}type: string\n/.test(dispatch)]).toEqual([w.name, true, true]);
  }
  const nightly = scheduled.find((w) => w.name === 'nightly.yml')?.text ?? '';
  expect(nightly).toContain(`select(.event == "schedule" or (.displayTitle | startswith("Carried by the wake task: ")))`);
  expect(nightly).not.toMatch(/--workflow nightly\.yml --event schedule/);
});

it('the wake task checks in by a monitor of its own, its script there', () => {
  const machine = (RULES as unknown as { machine_heartbeats: { monitor: string; script: string; margin_minutes: number }[] }).machine_heartbeats;
  expect(machine.map((m) => m.monitor)).toEqual(['wake-task']);
  for (const m of machine) {
    expect(() => readFileSync(join(MOBILE, m.script))).not.toThrow();
    expect(m.margin_minutes <= 2880).toBe(true);
  }
});

it('lets a check-in be late two days at most, so a stopped schedule is heard within the week', () => {
  for (const h of RULES.heartbeats) expect([h.monitor, h.margin_minutes <= 2880]).toEqual([h.monitor, true]);
});

describe('the check-in itself', () => {
  const run = (monitor: string, env: Record<string, string | undefined>) =>
    spawnSync(process.execPath, [join(MOBILE, 'scripts', 'heartbeat.mjs'), monitor],
      { encoding: 'utf8', env: { ...process.env, HEARTBEAT_CHECKIN_URL: undefined, ...env } });

  it('without its address, says so as a warning and lets the checks run', () => {
    const r = run('nightly', {});
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/::warning title=No heartbeat address::/);
  });

  it('refuses a monitor the rules do not name', () => {
    expect(run('nobody', {}).status).toBe(2);
  });

  it('refuses an address with nowhere for the monitor, and never prints the address', () => {
    const r = run('nightly', { HEARTBEAT_CHECKIN_URL: 'https://example.invalid/secret-key/' });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/secret-key/);
  });
});
