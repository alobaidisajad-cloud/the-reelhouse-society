/**
 * screenTimes.test.ts — the E2E run's screen times are read from the device
 * log as the workflow writes it, and the ceilings can say no; so can a screen
 * whose read failed.
 *
 * screen-times.mjs is run as run-flows.sh runs it, on log lines in logcat's
 * threadtime shape, the way useScreenReady's e2eTrace writes them.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = join(__dirname, '..', 'screen-times.mjs');
let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'screen-times-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const line = (name: string, ms: number) =>
  `10-02 18:01:02.345  4321  4377 W ReactNativeJS: [e2e] screen.ready {"name":"${name}","ms":${ms}}`;

const LOG = [
  '10-02 18:01:00.001  4321  4377 I ReactNativeJS: Running "main"',
  line('lobby', 900),
  line('film', 1400),
  line('lobby', 700),
  line('lobby', 2600),
  '10-02 18:01:03.000  4321  4377 W ReactNativeJS: [e2e] darkroom.field {"focused":true}',
  line('film', 1100),
].join('\n');

function run(log: string, ceilings?: Record<string, number>, ...extra: string[]) {
  writeFileSync(join(dir, 'logcat.txt'), log);
  const args = [SCRIPT, join(dir, 'logcat.txt'), ...extra];
  if (ceilings) {
    writeFileSync(join(dir, 'ceilings.json'), JSON.stringify(ceilings));
    args.push('--ceilings', join(dir, 'ceilings.json'));
  }
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
}

describe('screen-times.mjs', () => {
  it('reports each screen: how often, the median and the slowest; other trace lines are not screens', () => {
    const { code, out } = run(LOG);
    expect(code).toBe(0);
    expect(out).toMatch(/^film\s+2\s+1100 ms\s+1400 ms\s+—$/m);
    expect(out).toMatch(/^lobby\s+3\s+900 ms\s+2600 ms\s+—$/m);
    expect(out).not.toMatch(/darkroom/);
  });

  it('passes when every screen is inside its ceiling', () => {
    expect(run(LOG, { lobby: 3000, film: 1500 }, '--complete').code).toBe(0);
  });

  it('fails a screen opened three times or more whose typical opening is over its ceiling, naming it', () => {
    const { code, out } = run(LOG, { lobby: 800, film: 1500 });
    expect(code).toBe(1);
    expect(out).toContain("✗ lobby's typical opening took 900 ms (median of 3), over its ceiling of 800 ms");
    expect(out).not.toContain('✗ film');
  });

  it('lets one slow opening pass under twice the ceiling, and fails one past it as a hang', () => {
    expect(run(LOG, { lobby: 1400, film: 1500 }).code).toBe(0);
    const { code, out } = run(LOG, { lobby: 1200, film: 1500 });
    expect(code).toBe(1);
    expect(out).toContain('✗ lobby took 2600 ms once, over 2 times its ceiling (2400 ms): a hang');
  });

  it('judges a screen opened fewer than three times by the hang cap alone', () => {
    expect(run(LOG, { lobby: 3000, film: 1000 }).code).toBe(0);
    expect(run(LOG, { lobby: 3000, film: 600 }).out).toContain('✗ film took 1400 ms once, over 2 times its ceiling (1200 ms): a hang');
  });

  it('fails a screen that reports with no ceiling', () => {
    const { code, out } = run(LOG, { lobby: 3000 });
    expect(code).toBe(1);
    expect(out).toContain('✗ film has no ceiling');
  });

  it('fails a ceiling that measured nothing — but only when every flow ran', () => {
    const ceilings = { lobby: 3000, film: 1500, reader: 2000 };
    expect(run(LOG, ceilings).code).toBe(0);
    const { code, out } = run(LOG, ceilings, '--complete');
    expect(code).toBe(1);
    expect(out).toContain('✗ reader has a ceiling but never reported');
  });

  it('a gate with nothing to read fails, rather than passing on an empty log', () => {
    expect(run('', { lobby: 3000 }).code).toBe(1);
    expect(run('').code).toBe(0);
  });
});

describe('a screen whose read failed', () => {
  const failed = (name: string, at: string) =>
    `10-02 ${at}  4321  4377 W ReactNativeJS: [e2e] screen.failed {"name":"${name}","ms":300}`;
  // run-flows.sh's flow-times: each flow, its attempt, and the device clock as it began.
  const FLOWS = ['error_recovery\t1\t10-02 18:00:00.000', 'offline_resilience\t1\t10-02 18:05:00.000', 'session\t1\t10-02 18:10:00.000'];
  const withFlows = (log: string, ...extra: string[]) => {
    writeFileSync(join(dir, 'flow-times.txt'), FLOWS.join('\n'));
    return run(log, undefined, '--flow-times', join(dir, 'flow-times.txt'), ...extra);
  };

  it('fails the run, without ceilings too, naming the screen and the flow — the Dispatch of build 41', () => {
    const { code, out } = withFlows([LOG, failed('dispatch', '18:01:30.000')].join('\n'));
    expect(code).toBe(1);
    expect(out).toContain('✗ dispatch could not read during error_recovery');
    // Its time is no screen time: a failure is not a load.
    expect(out).not.toMatch(/^dispatch\s/m);
  });

  it('is the point in a flow that takes the network away, and is said, not failed', () => {
    const { code, out } = withFlows([LOG, failed('film', '18:06:00.000')].join('\n'));
    expect(code).toBe(0);
    expect(out).toContain('(1 failed read in flows that take the network away on purpose: offline_resilience)');
  });

  it('before any flow (the launch with animations on) it fails too', () => {
    expect(withFlows(failed('welcome', '17:59:00.000')).out).toContain('✗ welcome could not read during before the first flow');
  });

  it('the flows that take the network away are exactly the list it spares', () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import(${JSON.stringify(pathToFileURL(SCRIPT).href)}).then((m) => console.log(JSON.stringify(m.PLANTS_FAILURES)))`], { encoding: 'utf8' });
    const spared = JSON.parse(r.stdout);
    const flowDir = join(__dirname, '..', '..', '.maestro');
    const cutting = readdirSync(flowDir).filter((f) => f.endsWith('.yaml'))
      .filter((f) => /^\s*-\s*toggleAirplaneMode\b/m.test(readFileSync(join(flowDir, f), 'utf8')))
      .map((f) => f.replace(/\.yaml$/, ''));
    expect(cutting.length).toBeGreaterThan(0);
    expect(spared).toEqual(cutting);
  });
});
