/**
 * iosSimulator.test.ts — both iPhone jobs run on the one simulator they name, or say why not.
 *
 * e2e/ios-simulator.sh is run against a stand-in `xcrun` that answers `simctl list devices
 * available` as the macos-26 image does (iOS 26.2, 26.4 and 26.5, no iPhone 16 Pro), and as an
 * image with no iPhone 17 Pro would.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MOBILE } from '../../test-utils/readCode';

const BASH = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const posix = (p: string) => p.split('\\').join('/');

const MACOS_26 = [
  '== Devices ==',
  '-- iOS 26.2 --',
  '    iPhone 16e (11111111-1111-1111-1111-111111111111) (Shutdown)',
  '    iPhone 17 Pro (22222222-2222-2222-2222-222222222222) (Shutdown)',
  '    iPhone 17 Pro Max (33333333-3333-3333-3333-333333333333) (Shutdown)',
  '-- iOS 26.5 --',
  '    iPhone 17 (44444444-4444-4444-4444-444444444444) (Shutdown)',
  '    iPhone 17 Pro (55555555-5555-5555-5555-555555555555) (Shutdown)',
  '    iPhone 17 Pro Max (66666666-6666-6666-6666-666666666666) (Shutdown)',
].join('\n');

/** The script run with an `xcrun` that lists `devices`. */
function pick(devices: string) {
  const T = mkdtempSync(join(tmpdir(), 'ios-simulator-'));
  mkdirSync(join(T, 'bin'));
  writeFileSync(join(T, 'devices'), `${devices}\n`);
  writeFileSync(join(T, 'bin', 'xcrun'), `#!/usr/bin/env bash\ncat "${posix(join(T, 'devices'))}"\n`, { mode: 0o755 });
  return spawnSync(BASH, [posix(join(MOBILE, 'e2e', 'ios-simulator.sh'))], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(T, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` },
  });
}

it('names the iPhone 17 Pro on the newest iOS, never the Pro Max beside it', () => {
  const r = pick(MACOS_26);
  expect({ status: r.status, id: r.stdout.trim() }).toEqual({ status: 0, id: '55555555-5555-5555-5555-555555555555' });
});

it('with no iPhone 17 Pro, fails and names the iPhones there are', () => {
  const r = pick(MACOS_26.split('\n').filter((l) => !l.includes('iPhone 17 Pro (')).join('\n'));
  expect(r.status).toBe(1);
  expect(r.stdout).toBe('');
  expect(r.stderr).toContain('no iPhone 17 Pro simulator on this image');
  expect(r.stderr).toContain('iPhone 17 Pro Max (66666666');
});

it('is how both iPhone jobs choose their simulator', () => {
  for (const workflow of ['ios-launch.yml', 'speed-lab.yml']) {
    const text = readFileSync(join(MOBILE, '..', '.github', 'workflows', workflow), 'utf8');
    expect(`${workflow}: ${text.includes('DEV=$(bash e2e/ios-simulator.sh)')}`).toBe(`${workflow}: true`);
    expect(`${workflow}: ${text.includes('simctl list devices')}`).toBe(`${workflow}: false`);
  }
});
