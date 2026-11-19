/**
 * keptDebs.test.ts — scripts/kept-debs.sh, run in bash against a fake `dpkg-deb`, `dpkg-query`
 * and `sudo dpkg`: the packages a run before kept go in by dpkg alone, those installed already are
 * left as they are, and a failure says so by its exit, so the workflow lets apt fetch them.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MOBILE } from '../../test-utils/readCode';

const BASH = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
const SCRIPT = join(MOBILE, 'scripts', 'kept-debs.sh');
const posix = (p: string) => p.replace(/\\/g, '/');

// A .deb here holds its package's name; dpkg-deb -f reads it back.
const DPKG_DEB = `#!/usr/bin/env bash
cat "$2"
`;
// Installed: each name in __T__/installed.
const DPKG_QUERY = `#!/usr/bin/env bash
grep -qx "\${@: -1}" __T__/installed 2>/dev/null && printf 'install ok installed' && exit 0
exit 1
`;
// sudo dpkg -i: records what it was handed; refuses all when __T__/refuses is there, as dpkg does
// after unpacking them (half-installed). sudo dpkg --purge: records the names it takes back out.
const SUDO = `#!/usr/bin/env bash
[ "$1" = dpkg ] || exit 2
if [ "$2" = --purge ]; then shift 2; [ "$1" = --force-depends ] && shift; printf '%s\\n' "$@" >> __T__/purged; exit 0; fi
[ "$2" = -i ] || exit 2
shift 2
[ -f __T__/refuses ] && exit 1
for d in "$@"; do cat "$d" >> __T__/dpkg; done
`;

type Machine = { kept?: string[]; installed?: string[]; refuses?: boolean };

function run(o: Machine = {}) {
  const T = posix(mkdtempSync(join(tmpdir(), 'kept-debs-')));
  mkdirSync(join(T, 'bin'));
  mkdirSync(join(T, 'debs'));
  for (const [name, body] of [['dpkg-deb', DPKG_DEB], ['dpkg-query', DPKG_QUERY], ['sudo', SUDO]] as const) {
    writeFileSync(join(T, 'bin', name), body.replace(/__T__/g, T), { mode: 0o755 });
  }
  for (const p of o.kept ?? []) writeFileSync(join(T, 'debs', `${p}_1.0_amd64.deb`), `${p}\n`);
  writeFileSync(join(T, 'installed'), (o.installed ?? []).map((p) => `${p}\n`).join(''));
  if (o.refuses) writeFileSync(join(T, 'refuses'), '');
  const r = spawnSync(BASH, [posix(SCRIPT), `${T}/debs`], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(T, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` },
  });
  const dpkg = existsSync(join(T, 'dpkg')) ? readFileSync(join(T, 'dpkg'), 'utf8').trim().split('\n') : [];
  const purged = existsSync(join(T, 'purged')) ? readFileSync(join(T, 'purged'), 'utf8').trim().split('\n') : [];
  return { status: r.status, out: r.stdout, dpkg, purged };
}

describe('the kept packages go in without apt', () => {
  it('installs each kept package not yet installed, by dpkg alone, and leaves the rest', () => {
    const r = run({ kept: ['libnss3', 'libatk1.0-0t64', 'libxkbcommon0'], installed: ['libxkbcommon0'] });
    expect(r.status).toBe(0);
    expect(r.dpkg.sort()).toEqual(['libatk1.0-0t64', 'libnss3']);
  });

  it('asks dpkg for nothing when every kept package is installed already', () => {
    const r = run({ kept: ['libnss3'], installed: ['libnss3'] });
    expect(r.status).toBe(0);
    expect(r.dpkg).toEqual([]);
    expect(r.out).toContain('every kept package is installed already');
  });

  it('says, by its exit, that apt must fetch them: none kept, or dpkg refusing one', () => {
    expect(run().status).toBe(1);
    const refused = run({ kept: ['libnss3'], refuses: true });
    expect(refused.status).toBe(1);
    expect(refused.out).toContain('dpkg refused a kept package');
  });

  it('takes a refused set back out before apt runs, and never one that went in', () => {
    // dpkg leaves what it unpacked half-installed, and apt then installs nothing (God-Tier 44447946174).
    const refused = run({ kept: ['libgbm1', 'mesa-libgallium', 'libnss3'], installed: ['libnss3'], refuses: true });
    expect({ status: refused.status, purged: refused.purged.sort() }).toEqual({ status: 1, purged: ['libgbm1', 'mesa-libgallium'] });
    expect(run({ kept: ['libgbm1'] }).purged).toEqual([]);
  });
});

describe('the kept packages belong to one image', () => {
  it("every key the kept packages are cached under names the runner's image, restored and saved alike", () => {
    // Packages kept on one image and put on the next broke apt (God-Tier 44447946174: Mesa a patch behind).
    const wf = readFileSync(join(MOBILE, '..', '.github', 'workflows', 'god_tier_ci.yml'), 'utf8');
    const keys = [...wf.matchAll(/key: (apt-debs-[^\r\n]*)/g)].map(([, key]) => key ?? '');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => !/\$\{\{ steps\.image-\d+\.outputs\.version \}\}/.test(k))).toEqual([]);
    expect(wf.match(/run: echo "version=\$ImageVersion" >> "\$GITHUB_OUTPUT"/g)?.length).toBe(keys.length / 2);
  });
});

describe('apt is never waited into a lock it still holds', () => {
  it("every wait for apt, in every workflow, ends an apt that still holds its locks and repairs what it left", () => {
    // God-Tier 44473860748: the first try's apt, cut off at its five minutes, held the lists lock through the retry.
    const dir = join(MOBILE, '..', '.github', 'workflows');
    const WAIT = "timeout 180 bash -c 'while pgrep -x apt-get";
    const END = '&& { sudo pkill -x apt-get; sudo pkill -x apt; sudo pkill -x dpkg; sudo dpkg --configure -a > /dev/null 2>&1; } || true';
    const left: string[] = [];
    let waits = 0;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.yml'))) {
      const lines = readFileSync(join(dir, name), 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!line.includes(WAIT)) return;
        waits++;
        if (!(lines[i + 1] ?? '').includes(END)) left.push(`${name}:${i + 1}`);
      });
    }
    expect(waits).toBeGreaterThan(0);
    expect(left).toEqual([]);
  });
});
