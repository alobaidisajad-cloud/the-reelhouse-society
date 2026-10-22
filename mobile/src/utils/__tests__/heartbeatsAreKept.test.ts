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

it('and each checks in, only when the schedule fired, by the monitor the rules name', () => {
  for (const h of RULES.heartbeats) {
    const text = scheduled.find((x) => x.name === h.workflow)?.text ?? '';
    const job = text.slice(text.indexOf('\n  heartbeat:\n'));
    expect([h.workflow, /if: github\.event_name == 'schedule'/.test(job), job.includes(`node mobile/scripts/heartbeat.mjs ${h.monitor}\n`)])
      .toEqual([h.workflow, true, true]);
    expect([h.workflow, /HEARTBEAT_CHECKIN_URL: \$\{\{ secrets\.HEARTBEAT_CHECKIN_URL \}\}/.test(job)]).toEqual([h.workflow, true]);
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
