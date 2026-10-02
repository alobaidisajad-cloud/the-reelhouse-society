/**
 * screenTimes.test.ts — the E2E run's screen times are read from the device
 * log as the workflow writes it, and the ceilings can say no.
 *
 * screen-times.mjs is run as run-flows.sh runs it, on log lines in logcat's
 * threadtime shape, the way useScreenReady's e2eTrace writes them.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

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

  it('fails a screen whose slowest opening is over its ceiling, naming it', () => {
    const { code, out } = run(LOG, { lobby: 2500, film: 1500 });
    expect(code).toBe(1);
    expect(out).toContain('✗ lobby took 2600 ms, over its ceiling of 2500 ms');
    expect(out).not.toContain('✗ film');
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
