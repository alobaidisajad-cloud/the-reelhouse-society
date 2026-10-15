/**
 * iosLaunch.test.ts — the iPhone launch check's verdict (e2e/ios-launch.cjs),
 * shown saying no to each way a launch can fail, and the workflow shown using it.
 */
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MOBILE } from '../../test-utils/readCode';

const { readSamples, reportsSince, verdict } = require('../ios-launch.cjs') as {
  readSamples: (text: string) => { t: number; pid: string }[];
  reportsSince: (dir: string, epochS: number) => string[];
  verdict: (v: { samples: { t: number; pid: string }[]; ready: boolean; reports: string[] }) => { code: number; line: string };
};

/** A sample a second for 45 s: none before `start`, then `pid`, then `after` from `change` on. */
const run = (start: number, pid = '4242', change = Infinity, after = '-') =>
  Array.from({ length: 46 }, (_, t) => ({ t, pid: t < start ? '-' : t < change ? pid : after }));

describe('the verdict on one iPhone launch', () => {
  it('passes a launch that stays up and draws, however slowly the simulator started it', () => {
    expect(verdict({ samples: run(1), ready: true, reports: [] }).code).toBe(0);
    expect(verdict({ samples: run(9), ready: true, reports: [] })).toEqual({
      code: 0, line: 'alive at 5 s and 25 s (process 4242, started at 9 s); first screen ready; no crash report',
    });
  });

  it('fails the app, never the harness, when it dies within 5 s', () => {
    expect(verdict({ samples: run(2, '4242', 5), ready: true, reports: [] })).toEqual({
      code: 1, line: "the app's process 4242 was not running 5 s after it started (none)",
    });
  });

  it('fails the app when it dies before 25 s, or comes back as another process', () => {
    expect(verdict({ samples: run(2, '4242', 20), ready: true, reports: [] }).code).toBe(1);
    expect(verdict({ samples: run(2, '4242', 12, '5151'), ready: true, reports: [] }).line).toMatch(/not running 25 s .*process 5151/);
  });

  it('fails the app when it stays up but never draws its first screen', () => {
    expect(verdict({ samples: run(2), ready: false, reports: [] }).code).toBe(1);
  });

  it('fails the app on any crash report since the launch, even one it survived', () => {
    expect(verdict({ samples: run(2), ready: true, reports: ['ReelHouse-2026-10-15.ips'] }).code).toBe(1);
    expect(verdict({ samples: run(99), ready: false, reports: ['ReelHouse.ips'] }).code).toBe(1);
  });

  it('calls it the harness only when the simulator never started the app, or too late to watch', () => {
    expect(verdict({ samples: run(99), ready: false, reports: [] }).code).toBe(2);
    expect(verdict({ samples: run(30), ready: true, reports: [] })).toEqual({
      code: 2, line: 'the app started at 30 s, too late to watch it for 25 s',
    });
  });

  it('reads the samples the workflow writes, and only the reports written since the launch', () => {
    expect(readSamples('0 -\r\n1 4242\n\n2 4242\n')).toEqual([{ t: 0, pid: '-' }, { t: 1, pid: '4242' }, { t: 2, pid: '4242' }]);
    const dir = mkdtempSync(join(tmpdir(), 'ios-reports-'));
    for (const f of ['ReelHouse-old.ips', 'ReelHouse-new.ips', 'Safari-new.ips']) writeFileSync(join(dir, f), '{}');
    utimesSync(join(dir, 'ReelHouse-old.ips'), 1000, 1000);
    expect(reportsSince(dir, 2000)).toEqual(['ReelHouse-new.ips']);
  });
});

describe('the iPhone launch workflow', () => {
  const wf = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'ios-launch.yml'), 'utf8');

  it('samples the app\'s process each second and lets the verdict decide', () => {
    expect(wf).toContain('launchctl list | awk');
    expect(wf).toMatch(/node e2e\/ios-launch\.cjs "\$S\/samples-\$1\.txt" "\$S\/stream-\$1\.txt" "\$start"/);
  });

  it('tries once more only when the verdict blames the simulator', () => {
    expect(wf).toMatch(/if \[ "\$rc" = "2" \]; then/);
    expect(wf).not.toMatch(/grep -ci reelhouse/);
  });
});
