/**
 * passwordNeverLeaves.test.ts — no seeded account's password leaves the run: the member's, and the
 * admin's the second-key flow signs in with (each E2E_<WHO>_PASSWORD).
 *
 * Two doors: annotate.mjs (every annotation and the run's summary) and
 * scrub.mjs (the files e2e.yml keeps). Both are run as the workflow runs them.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const PASSWORD = 'qX3-v_9Rz8Lm0Kp2Wd7Ta1Ys';
const ADMIN = 'Zp8-k_2Hq7Nn4Rv1Ce6Ub3Wx';
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'password-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const node = (script: string, args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [join(__dirname, '..', script), ...args], {
    encoding: 'utf8', env: { ...process.env, E2E_MEMBER_PASSWORD: PASSWORD, E2E_ADMIN_PASSWORD: ADMIN, GITHUB_STEP_SUMMARY: join(dir, 'summary.md'), ...env },
  });

describe('annotate.mjs', () => {
  beforeEach(() => writeFileSync(join(dir, 'report.txt'), `Maestro said: Input text ${PASSWORD} FAILED\nand again ${PASSWORD}\nthe admin typed ${ADMIN}`));

  it('hides it in the annotation and in the summary', () => {
    const r = node('annotate.mjs', ['A title', join(dir, 'report.txt'), 'notice']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Input text ••• FAILED%0Aand again •••%0Athe admin typed •••');
    expect([r.stdout.includes(PASSWORD), r.stdout.includes(ADMIN)]).toEqual([false, false]);
    const summary = readFileSync(join(dir, 'summary.md'), 'utf8');
    expect(summary).toContain('Input text ••• FAILED');
    expect(summary).not.toContain(PASSWORD);
  });

  it('writes the summary alone at the "summary" level — no annotation', () => {
    const r = node('annotate.mjs', ['Past ten notices', join(dir, 'report.txt'), 'summary']);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    expect(readFileSync(join(dir, 'summary.md'), 'utf8')).toContain('### Past ten notices');
  });

  it('writes a table as the markdown it is at the "table" level, hidden there too', () => {
    const r = node('annotate.mjs', ['The launches', join(dir, 'report.txt'), 'table']);
    expect([r.status, r.stdout]).toEqual([0, '']);
    expect(readFileSync(join(dir, 'summary.md'), 'utf8')).toBe('### The launches\n\nMaestro said: Input text ••• FAILED\nand again •••\nthe admin typed •••\n');
  });
});

describe('scrub.mjs', () => {
  it('takes it out of every text file it is given, nested or named, and leaves pictures alone', () => {
    mkdirSync(join(dir, 'maestro-debug', '.maestro', 'tests', 't', 'f'), { recursive: true });
    const commands = join(dir, 'maestro-debug', '.maestro', 'tests', 't', 'f', 'commands.json');
    writeFileSync(commands, JSON.stringify([{ command: { inputTextCommand: { text: PASSWORD } } }]));
    writeFileSync(join(dir, 'stream.txt'), `typed ${PASSWORD}\nthen ${ADMIN}\n`);
    writeFileSync(join(dir, 'maestro-debug', 'shot.png'), `\x89PNG ${PASSWORD}`);
    const r = node('scrub.mjs', [join(dir, 'maestro-debug'), join(dir, 'stream.txt'), join(dir, 'never-written')]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('scrubbed the passwords from 2 files');
    expect(readFileSync(commands, 'utf8')).toBe('[{"command":{"inputTextCommand":{"text":"***"}}}]');
    expect(readFileSync(join(dir, 'stream.txt'), 'utf8')).toBe('typed ***\nthen ***\n');
    expect(readFileSync(join(dir, 'maestro-debug', 'shot.png'), 'latin1')).toContain(PASSWORD);
  });

  it('leaves every other byte as it was', () => {
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x41, 0xe2, 0x80, 0xa6, 0x0d, 0x0a, ...Buffer.from(` ${PASSWORD} `), 0xff]);
    writeFileSync(join(dir, 'odd.log'), bytes);
    node('scrub.mjs', [dir]);
    expect(readFileSync(join(dir, 'odd.log'))).toEqual(Buffer.from([0xef, 0xbb, 0xbf, 0x41, 0xe2, 0x80, 0xa6, 0x0d, 0x0a, ...Buffer.from(' *** '), 0xff]));
  });

  it('says so when there is no password to scrub', () => {
    const r = node('scrub.mjs', [dir], { E2E_MEMBER_PASSWORD: '', E2E_ADMIN_PASSWORD: '' });
    expect(r.stdout.trim()).toBe('no password to scrub (no E2E_<WHO>_PASSWORD is set)');
  });
});
