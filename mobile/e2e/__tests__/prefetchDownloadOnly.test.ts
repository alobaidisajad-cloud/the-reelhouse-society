/**
 * prefetchDownloadOnly.test.ts — the E2E build fails unless the app's picture
 * prefetch, asked for 'disk', only downloads.
 *
 * prefetch-download-only.mjs is run as the E2E build runs it, on `dexdump -d`
 * text in the shape of the glide-log-level check's APKs: expo-image's module
 * method with the patch (downloadOnly on CachePolicy.DISK), and without it.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = join(__dirname, '..', 'prefetch-download-only.mjs');
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'prefetch-download-only-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const PREFETCH = 'expo.modules.image.ExpoImageModule$definition$lambda$22$$inlined$AsyncFunction$1.invoke';
const head = (name: string) => [
  '  Virtual methods   -',
  `    #0              : (in L${name.slice(0, name.lastIndexOf('.')).split('.').join('/')};)`,
  "      name          : 'invoke'",
  '      code          -',
  `5a1000:                                        |[5a1000] ${name}:([Ljava/lang/Object;)Ljava/lang/Object;`,
];
const insn = (n: number, text: string) => `5a10${(n * 2).toString(16).padStart(2, '0')}: 0000                                   |${n.toString(16).padStart(4, '0')}: ${text}`;
const DISK = 'sget-object v4, Lexpo/modules/image/records/CachePolicy;.DISK:Lexpo/modules/image/records/CachePolicy; // field@2a31';
const WITH = 'invoke-static {v6}, Lcom/bumptech/glide/Glide;.with:(Landroid/content/Context;)Lcom/bumptech/glide/RequestManager; // method@0812';
const DOWNLOAD_ONLY = 'invoke-virtual {v4}, Lcom/bumptech/glide/RequestManager;.downloadOnly:()Lcom/bumptech/glide/RequestBuilder; // method@0880';
const URL = 'new-instance v5, Lcom/bumptech/glide/load/model/GlideUrl; // type@0e61';
const LOAD = 'invoke-virtual {v4, v5}, Lcom/bumptech/glide/RequestBuilder;.load:(Ljava/lang/Object;)Lcom/bumptech/glide/RequestBuilder; // method@0861';
const SUBMIT = 'invoke-virtual {v4}, Lcom/bumptech/glide/RequestBuilder;.submit:()Lcom/bumptech/glide/request/FutureTarget; // method@086f';
const method = (name: string, ...body: string[]) => [...head(name), ...body.map((t, i) => insn(i, t)), insn(body.length, 'return-object v0'), '      catches       : (none)'];

function check(lines: string[], env: Record<string, string> = {}) {
  writeFileSync(join(dir, 'dex.txt'), lines.join('\n') + '\n');
  const r = spawnSync(process.execPath, [SCRIPT, join(dir, 'dex.txt')], { encoding: 'utf8', env: { ...process.env, E2E_OLD_CLIENT: '', ...env } });
  return { status: r.status, out: r.stdout.trim(), stderr: r.stderr };
}

it('passes the patched app: on CachePolicy.DISK, a GlideUrl through downloadOnly() and submit()', () => {
  const r = check(method(PREFETCH, DISK, WITH, DOWNLOAD_ONLY, URL, LOAD, SUBMIT, WITH, URL, LOAD, SUBMIT));
  expect(r).toEqual({ status: 0, stderr: '', out: expect.stringContaining('The prefetch downloads without decoding: ' + PREFETCH) });
});

it('fails the unpatched app: the prefetch loads and submits, but never calls downloadOnly()', () => {
  const r = check(method(PREFETCH, WITH, URL, LOAD, SUBMIT));
  expect(r.status).toBe(1);
  expect(r.out).toContain(`Closest: ${PREFETCH}, which makes a GlideUrl, calls submit().`);
  expect(r.out).toContain('patches/');
});

it('fails a prefetch that reads CachePolicy.DISK yet still loads through Glide whole: downloadOnly() is the point', () => {
  const r = check(method(PREFETCH, DISK, WITH, URL, LOAD, SUBMIT));
  expect(r.status).toBe(1);
  expect(r.out).toContain(`Closest: ${PREFETCH}, which reads CachePolicy.DISK, makes a GlideUrl, calls submit().`);
});

it('fails when each part is in a different method: one method must do the whole prefetch', () => {
  const r = check([
    ...method('expo.modules.image.ExpoImageModule.definition', DISK, DOWNLOAD_ONLY),
    ...method(PREFETCH, URL, LOAD, SUBMIT),
  ]);
  expect(r.status).toBe(1);
});

it('reads only expo-image\'s module: a downloadOnly() elsewhere is not the answer', () => {
  const r = check(method('com.example.Other.prefetch', DISK, WITH, DOWNLOAD_ONLY, URL, LOAD, SUBMIT));
  expect(r.status).toBe(1);
  expect(r.out).toContain('No method of expo.modules.image.ExpoImageModule is in the APK');
});

it('fails an empty file: the APK proves nothing then', () => {
  expect(check([]).status).toBe(1);
});

it('is not run for a shipped client, and says so', () => {
  const r = check([], { E2E_OLD_CLIENT: 'TestFlight build 41' });
  expect(r.status).toBe(0);
  expect(r.out).toMatch(/^Not run: old client\. TestFlight build 41 ships expo-image without the app's patch/);
});

it('is asked of every E2E build, after it is built, and its report is kept', () => {
  const workflow = readFileSync(join(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8').replace(/\r\n/g, '\n');
  const step = "name: The built app's prefetch downloads without decoding";
  expect(workflow).toContain('node e2e/prefetch-download-only.mjs "$RUNNER_TEMP/prefetch-dex.txt"');
  expect(workflow).toContain('keep = index($0, "] expo.modules.image.ExpoImageModule") > 0');
  expect(workflow.indexOf(step)).toBeGreaterThan(workflow.indexOf('name: Build the E2E app (release APK)'));
  expect(workflow.indexOf(step)).toBeLessThan(workflow.indexOf('name: Hand the app to the shards'));
  expect(workflow).toContain('${{ runner.temp }}/prefetch-download-only.txt');
  // No `if:`: it runs for a shipped client too, and the script says why it judges none.
  const block = workflow.slice(workflow.indexOf(step), workflow.indexOf('\n      - ', workflow.indexOf(step)));
  expect(block).not.toMatch(/^\s+if:/m);
});
