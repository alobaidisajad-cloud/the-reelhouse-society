/**
 * glideLogLevel.test.ts — the E2E build fails unless the app tells Glide to log
 * its errors only.
 *
 * glide-log-level.mjs is run as the E2E build runs it, on `dexdump -d` text in
 * the shape of two real APKs: study run 37628665206's, built with Expo's
 * ready-made expo-image (level 2, VERBOSE), and study run 37674283540's, built
 * with expo-image compiled from source (level 6, ERROR).
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'glide-log-level.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'glide-log-level-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const HEAD = [
  '  Virtual methods   -',
  '    #0              : (in Lexpo/modules/image/ExpoImageAppGlideModule;)',
  "      name          : 'applyOptions'",
  "      type          : '(Landroid/content/Context;Lcom/bumptech/glide/GlideBuilder;)V'",
  '      access        : 0x0001 (PUBLIC)',
  '      code          -',
  '      registers     : 4',
  '      insns size    : 18 16-bit code units',
  '44d024:                                        |[44d024] expo.modules.image.ExpoImageAppGlideModule.applyOptions:(Landroid/content/Context;Lcom/bumptech/glide/GlideBuilder;)V',
  '44d034: 1a00 e88d                              |0000: const-string v0, "context" // string@8de8',
  '44d038: 7120 e7fc 0200                         |0002: invoke-static {v2, v0}, Lkotlin/jvm/internal/Intrinsics;.checkNotNullParameter:(Ljava/lang/Object;Ljava/lang/String;)V // method@fce7',
  '44d03e: 1a00 7787                              |0005: const-string v0, "builder" // string@8777',
  '44d042: 7120 e7fc 0300                         |0007: invoke-static {v3, v0}, Lkotlin/jvm/internal/Intrinsics;.checkNotNullParameter:(Ljava/lang/Object;Ljava/lang/String;)V // method@fce7',
  '44d048: 6f30 a008 2103                         |000a: invoke-super {v1, v2, v3}, Lcom/bumptech/glide/module/AppGlideModule;.applyOptions:(Landroid/content/Context;Lcom/bumptech/glide/GlideBuilder;)V // method@08a0',
];
const SET = '44d050: 6e20 2908 2300                         |000e: invoke-virtual {v3, v2}, Lcom/bumptech/glide/GlideBuilder;.setLogLevel:(I)Lcom/bumptech/glide/GlideBuilder; // method@0829';
const TAIL = ['44d056: 0e00                                   |0011: return-void', '      catches       : (none)'];
const constant = (n: number) => `44d04e: 12${n}2                                   |000d: const/4 v2, #int ${n} // #${n}`;
const method = (...insns: string[]) => [...HEAD, ...insns, ...TAIL];

function check(...lines: string[]) {
  writeFileSync(join(dir, 'dex.txt'), lines.join('\n') + '\n');
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'dex.txt')], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout.trim(), stderr: r.stderr };
}

it('passes the app built with expo-image from source: level 6 — run 37674283540', () => {
  expect(check(...method(constant(6), SET))).toEqual({
    status: 0, stderr: '', out: 'Glide logs errors only: ExpoImageAppGlideModule.applyOptions sets level 6 (ERROR).',
  });
});

it('fails the app built with Expo’s ready-made expo-image: level 2, VERBOSE — run 37628665206', () => {
  const r = check(...method(constant(2), SET));
  expect(r.status).toBe(1);
  expect(r.out).toContain("Glide's log level in the APK: 2 (VERBOSE) — not 6 (ERROR).");
  expect(r.out).toContain('buildFromSource');
});

it('fails when the level is not one constant: a branch chooses it at run time', () => {
  const r = check(...method(
    '44d04a: 3800 0500                              |000c: if-eqz v0, 0011 // +0005',
    constant(2),
    '44d04c: 2802                                   |000e: goto 0010 // +0002',
    '44d04d: 1262                                   |000f: const/4 v2, #int 6 // #6',
    SET,
  ));
  expect(r.status).toBe(1);
  expect(r.out).toContain('not one constant');
});

it('fails when the method is missing — the APK proves nothing then', () => {
  const r = check('  Virtual methods   -', ...TAIL);
  expect(r.status).toBe(1);
  expect(r.out).toContain('is not in the APK');
});

it('fails two copies of the method, even both at 6: which one Glide uses is not known', () => {
  const r = check(...method(constant(6), SET), ...method(constant(6), SET));
  expect(r.status).toBe(1);
  expect(r.out).toContain('2 copies of the method');
});

it('is asked of every E2E build, and package.json has expo-image compiled from source', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
  expect(pkg.expo.autolinking.android.buildFromSource).toContain('expo-image');
  const workflow = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8');
  expect(workflow).toContain('node e2e/glide-log-level.mjs "$RUNNER_TEMP/glide-dex.txt"');
  expect(workflow.indexOf("name: The built app logs Glide's errors only")).toBeGreaterThan(workflow.indexOf('name: Build the E2E app (release APK)'));
});

it('reads only the method it names: another setLogLevel elsewhere is not the answer', () => {
  const other = [
    '44e000:                                        |[44e000] com.example.Other.applyOptions:(Landroid/content/Context;Lcom/bumptech/glide/GlideBuilder;)V',
    '44e010: 1222                                   |0000: const/4 v2, #int 2 // #2',
    SET.replace('|000e', '|0001'),
    '44e016: 0e00                                   |0004: return-void',
  ];
  expect(check(...other, ...method(constant(6), SET)).status).toBe(0);
  expect(check(...other).status).toBe(1);
});
