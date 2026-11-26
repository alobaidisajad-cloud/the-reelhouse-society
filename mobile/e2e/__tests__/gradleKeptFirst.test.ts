/**
 * gradleKeptFirst.test.ts — scripts/gradle-kept-first.sh, run in bash against a fake `gradlew`: the
 * build runs offline from the kept packages first, asks the network only when they lack something
 * (a library or a plugin Gradle could not resolve), patiently, and says so in the step's output; any other failure stops it.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MOBILE } from '../../test-utils/readCode';

const BASH = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const SCRIPT = join(MOBILE, 'scripts', 'gradle-kept-first.sh');
const posix = (p: string) => p.replace(/\\/g, '/');

// Each run of the fake takes its next outcome from __T__/outcomes: ok, missing (a library the kept
// copy lacks, as Gradle says it offline), plugin (a plugin it lacks, as Gradle says that) or broken
// (the code), and writes its arguments to __T__/calls.
const GRADLEW = `#!/usr/bin/env bash
echo "$*" >> __T__/calls
n=$(( $(cat __T__/n 2>/dev/null || echo 0) + 1 )); echo $n > __T__/n
case "$(sed -n "\${n}p" __T__/outcomes)" in
  ok) echo "BUILD SUCCESSFUL in 1m"; exit 0 ;;
  missing) echo "> No cached version of org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.0 available for offline mode."; echo "BUILD FAILED"; exit 1 ;;
  plugin) echo "Plugin [id: 'org.gradle.toolchains.foojay-resolver-convention', version: '1.0.0'] was not found in any of the following sources:"
    echo "- Plugin Repositories (could not resolve plugin artifact 'org.gradle.toolchains.foojay-resolver-convention:org.gradle.toolchains.foojay-resolver-convention.gradle.plugin:1.0.0')"
    echo "BUILD FAILED in 24s"; exit 1 ;;
  *) echo "e: file:///app/src/Main.kt:3:1 Unresolved reference: x"; echo "BUILD FAILED"; exit 1 ;;
esac
`;

function build(outcomes: string[]) {
  const T = posix(mkdtempSync(join(tmpdir(), 'gradle-kept-')));
  writeFileSync(join(T, 'gradlew'), GRADLEW.replace(/__T__/g, T), { mode: 0o755 });
  writeFileSync(join(T, 'outcomes'), `${outcomes.join('\n')}\n`);
  const r = spawnSync(BASH, [posix(SCRIPT), 'assembleRelease', '--no-daemon'], {
    cwd: T, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: `${T}/output` },
  });
  const read = (f: string) => (existsSync(join(T, f)) ? readFileSync(join(T, f), 'utf8').trim() : '');
  return { status: r.status, stdout: r.stdout, calls: read('calls').split('\n'), output: read('output') };
}

const PATIENT = '-Dorg.gradle.internal.repository.max.tentatives=8 -Dorg.gradle.internal.repository.initial.backoff=5000';

describe('a Gradle build from the kept packages first', () => {
  it('builds offline, once, when the kept packages hold everything, and fetches nothing', () => {
    expect(build(['ok'])).toMatchObject({ status: 0, calls: ['--offline assembleRelease --no-daemon'], output: '' });
  });

  it('asks the network, patiently, only for what the kept packages lack, and says it fetched', () => {
    const r = build(['missing', 'ok']);
    expect(r).toMatchObject({ status: 0, calls: ['--offline assembleRelease --no-daemon', `${PATIENT} assembleRelease --no-daemon`], output: 'fetched=true' });
    expect(r.stdout).toMatch(/the kept packages lack what the build asks for/);
  });

  it('asks the network for a plugin the kept packages lack, which Gradle names without a word of offline mode', () => {
    // As every build of nightly 45804336594 failed: the foojay toolchain plugin, in 24 s, offline.
    expect(build(['plugin', 'ok'])).toMatchObject({
      status: 0, calls: ['--offline assembleRelease --no-daemon', `${PATIENT} assembleRelease --no-daemon`], output: 'fetched=true' });
  });

  it('stops on any other failure, offline, never asking the network', () => {
    expect(build(['broken', 'ok'])).toMatchObject({ status: 1, calls: ['--offline assembleRelease --no-daemon'], output: '' });
  });

  it('fails as the online build fails', () => {
    expect(build(['missing', 'broken'])).toMatchObject({ status: 1, output: 'fetched=true' });
  });

  it('runs in bash as stored', () => {
    expect(readFileSync(SCRIPT, 'utf8')).not.toContain('\r');
  });
});
