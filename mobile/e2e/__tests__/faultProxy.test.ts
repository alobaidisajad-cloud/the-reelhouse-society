/**
 * faultProxy.test.ts — e2e/fault-proxy.mjs, the network between the app and the sealed house, run
 * in a child process against a real local house: untouched with no fault, and each fault doing
 * exactly what it says, the request log recording what happened.
 */
import { spawnSync } from 'child_process';
import { join } from 'path';
import { pathToFileURL } from 'url';

const SCRIPT = pathToFileURL(join(__dirname, '..', 'fault-proxy.mjs')).href;

/** The scenario, as the child runs it: each step's outcome, by name, printed as JSON. */
const SCENARIO = `
import http from 'node:http';
const { startProxy, refusalOf } = await import(${JSON.stringify(SCRIPT)});
const writes = [];
const house = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/write') { writes.push(body); res.writeHead(201, { 'Content-Type': 'application/json' }); return res.end('{"saved":true}'); }
    if (req.url === '/big') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('x'.repeat(10000)); }
    if (req.url === '/pieces') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      let sent = 0;
      const piece = () => { res.write('p'.repeat(4096)); sent += 1; if (sent < 8) setTimeout(piece, 20); else res.end(); };
      return piece();
    }
    if (req.url === '/later') { setTimeout(() => { res.writeHead(200); res.end('late'); }, 300); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hello');
  });
});
house.on('upgrade', (req, socket) => {
  socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\n\\r\\n');
  socket.on('data', (d) => socket.write(d));
});
await new Promise((r) => house.listen(0, '127.0.0.1', r));
const ran = [];
// What Android's tools answer, as the emulator's do; the marker is back unless a scenario says not.
let markerBack = true;
const ANSWERS = [
  [/bmgr enable true$/, 'Backup Manager now enabled'],
  [/bmgr transport /, 'Selected transport com.android.localtransport/.LocalTransport (formerly com.android.localtransport/.LocalTransport)'],
  [/bmgr backupnow /, 'Running incremental backup for 1 requested packages.\\nPackage com.reelhouse.society with result: Success\\nBackup finished with result: Success'],
  [/^adb (uninstall|install) /, 'Success'],
  [/bmgr list sets$/, '  1 : Local disk image'],
  [/bmgr restore 1 com.reelhouse.society$/, 'restoreStarting: 1 packages\\nonUpdate: 0 = com.reelhouse.society\\nrestoreFinished: 0\\ndone'],
];
const run = (cmd, args) => {
  const line = [cmd, ...args].join(' ');
  ran.push(line);
  if (args.includes('supabase_storage_reelhouse-e2e')) return { status: 1, said: 'No such container' };
  if (line.includes('e2e-backup-marker')) return markerBack ? { status: 0, said: args.at(-1) } : { status: 1, said: 'ls: ' + args.at(-1) + ': No such file or directory' };
  const known = ANSWERS.find(([re]) => re.test(line));
  return { status: 0, said: known ? known[1] : '' };
};
const p = await startProxy({ to: '127.0.0.1:' + house.address().port, run });
const ask = (method, path, body, timeout = 3000) => new Promise((resolve) => {
  const t0 = Date.now();
  const req = http.request({ host: '127.0.0.1', port: p.port, method, path, agent: false,
    headers: body ? { 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], length: d.length, body: d.slice(0, 40), ms: Date.now() - t0 }));
    res.on('aborted', () => resolve({ cutAt: d.length }));
    res.on('error', (e) => resolve({ error: e.code ?? e.message, said: e.message, cutAt: d.length }));
  });
  req.setTimeout(timeout, () => req.destroy(new Error('no answer')));
  req.on('error', (e) => resolve({ error: e.code ?? e.message, said: e.message }));
  if (body) req.write(body);
  req.end();
});
const control = (method, path, f) => new Promise((resolve) => {
  const b = f === undefined ? '' : JSON.stringify(f);
  const req = http.request({ host: '127.0.0.1', port: p.controlPort, method, path, agent: false, headers: { 'Content-Length': Buffer.byteLength(b) } }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
  });
  req.end(b);
});
const out = {};
out.passes = await ask('GET', '/ok');
out.refusals = [refusalOf({ kind: 'storm' }), refusalOf({ kind: 'slow', latencyMs: -1, jitterMs: 0, bytesPerSecond: 1 }), refusalOf({ kind: 'frozen', why: 'x' }), refusalOf({ kind: 'http', route: '(', status: 503 })];
out.refusedByControl = (await control('POST', '/fault', { kind: 'storm' })).status;

await control('POST', '/fault', { kind: 'http', route: '^/rest/v1/films', status: 503 });
out.http = [await ask('GET', '/rest/v1/films?id=1'), await ask('GET', '/rest/v1/films?id=2'), await ask('GET', '/rest/v1/logs')];
await control('DELETE', '/fault');

const before = writes.length;
await control('POST', '/fault', { kind: 'answer-lost', route: '^/write' });
out.answerLost = await ask('POST', '/write', '{"log":1}');
out.answerLostSaved = writes.slice(before);
out.afterAnswerLost = await ask('POST', '/write', '{"log":2}');

await control('POST', '/fault', { kind: 'cut', afterBytes: 40, route: '^/write' });
out.cut = await ask('POST', '/write', 'y'.repeat(1000));
out.cutSaved = writes.filter((w) => w.startsWith('y')).length;

await control('POST', '/fault', { kind: 'frozen' });
out.frozen = await ask('GET', '/ok', undefined, 600);
await control('DELETE', '/fault');
// Frozen while the answer is on its way back: it never arrives.
const late = ask('GET', '/later', undefined, 900);
await new Promise((r) => setTimeout(r, 100));
await control('POST', '/fault', { kind: 'frozen' });
out.frozenMidway = await late;
await control('DELETE', '/fault');

await control('POST', '/fault', { kind: 'slow', latencyMs: 300, jitterMs: 0, bytesPerSecond: 20480 });
out.slow = await ask('GET', '/big');
await control('DELETE', '/fault');
await control('POST', '/fault', { kind: 'slow', latencyMs: 300, jitterMs: 0, bytesPerSecond: 1048576 });
out.slowInPieces = await ask('GET', '/pieces');
await control('DELETE', '/fault');

await control('POST', '/fault', { kind: 'limit', bytes: 100 });
out.limit = await ask('GET', '/big');
await control('DELETE', '/fault');

out.upgrade = await new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: p.port, path: '/realtime/v1/websocket', agent: false,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' } });
  req.on('upgrade', (res, socket) => {
    const sent = 'GET /not-a-request HTTP/1.1\\r\\n\\r\\n';
    socket.once('data', (d) => { resolve({ status: res.statusCode, echoed: d.toString() === sent }); socket.destroy(); });
    socket.write(sent);
  });
  req.end();
});

out.parts = [
  await control('POST', '/part', { part: 'realtime', state: 'stopped' }),
  await control('POST', '/part', { part: 'realtime', state: 'started' }),
  await control('POST', '/part', { part: 'db', state: 'stopped' }),
  await control('POST', '/part', { part: 'storage', state: 'stopped' }),
  await control('POST', '/dns', { blocked: true }),
  await control('POST', '/dns', { blocked: false }),
  await control('POST', '/dns', { blocked: 'yes' }),
].map((r) => ({ status: r.status, ...r.body }));
out.ranParts = [...ran];
out.phone = [
  await control('POST', '/phone', { set: 'font_scale', to: 1.3 }),
  await control('POST', '/phone', { set: 'density', to: 560 }),
  await control('POST', '/phone', { set: 'density', to: 'reset' }),
  await control('POST', '/phone', { set: 'dont_keep_activities', to: true }),
  await control('POST', '/phone', { set: 'killed_in_background', to: true }),
  await control('POST', '/phone', { set: 'force_stopped', to: true }),
  await control('POST', '/phone', { set: 'font_scale', to: 9 }),
  await control('POST', '/phone', { set: 'density', to: '560; reboot' }),
  await control('POST', '/phone', { set: 'airplane', to: true }),
  await control('POST', '/phone', { set: 'font_scale', to: 1, also: 'x' }),
].map((r) => ({ status: r.status, ...r.body }));
out.ranPhone = ran.length;
out.backup = [
  await control('POST', '/backup', { step: 'save' }),
  await control('POST', '/backup', { step: 'reinstall' }),
  await control('POST', '/backup', { step: 'restore' }),
  await control('POST', '/backup', { step: 'marker' }),
  await control('POST', '/backup', { step: 'wipe' }),
].map((r) => ({ status: r.status, ...r.body }));
markerBack = false;
out.markerGone = await control('POST', '/backup', { step: 'marker' }).then((r) => ({ status: r.status, ...r.body }));
out.ranBackup = ran.length;
// This proxy was started with no old build: the upgrade's first step says so.
out.upgradeAlone = await control('POST', '/upgrade', { step: 'old' }).then((r) => ({ status: r.status, ...r.body }));
// A second proxy, given the build in members' hands.
const q = await startProxy({ to: '127.0.0.1:' + house.address().port, run, oldApk: '/runner/old/app-release.apk' });
const askQ = (body) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: q.controlPort, path: '/upgrade', method: 'POST', agent: false }, (res) => {
    let text = '';
    res.on('data', (c) => { text += c; });
    res.on('end', () => resolve({ status: res.statusCode, ...JSON.parse(text) }));
  });
  req.end(JSON.stringify(body));
});
out.appUpgrade = [await askQ({ step: 'old' }), await askQ({ step: 'new' }), await askQ({ step: 'sideways' })];
await q.close();
out.ran = ran;

out.log = (await control('GET', '/log')).body.map(({ method, path, status, fault }) => ({ method, path, status, fault }));
await p.close();
house.close();
console.log(JSON.stringify(out));
`;

let out: Record<string, any>;
beforeAll(() => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', SCENARIO], { encoding: 'utf8', timeout: 60_000 });
  if (r.status !== 0) throw new Error(`the scenario did not run: ${r.stderr}`);
  out = JSON.parse(r.stdout.trim().split('\n').pop() ?? '{}');
}, 70_000);

it('passes the app\'s request untouched with no fault set', () => {
  expect(out.passes).toMatchObject({ status: 200, body: 'hello' });
});

it('refuses a fault it cannot carry out, naming why', () => {
  expect(out.refusals).toEqual([
    'a kind from slow, frozen, cut, answer-lost, limit, http',
    'slow needs latencyMs',
    'frozen takes no why',
    'route is not a regular expression: (',
  ]);
  expect(out.refusedByControl).toBe(400);
});

it('answers a matching route with an HTML 5xx page, as a gateway in trouble does, until cleared', () => {
  expect(out.http[0]).toMatchObject({ status: 503, type: 'text/html; charset=utf-8' });
  expect(out.http[0].body).toContain('<!DOCTYPE html>');
  expect(out.http[1]).toMatchObject({ status: 503 });
  expect(out.http[2]).toMatchObject({ status: 200, body: 'hello' });
});

it('loses the answer of a write the house saved: the app is reset, the row is there, once', () => {
  // A reset, as the plan's cut is, not a close: Node calls a close "socket hang up" under the same code.
  expect(out.answerLost).toMatchObject({ error: 'ECONNRESET', said: 'read ECONNRESET' });
  expect(out.answerLostSaved).toEqual(['{"log":1}']);
  expect(out.afterAnswerLost).toMatchObject({ status: 201 });
});

it('cuts a request halfway: the app is reset and the house never has it whole', () => {
  expect(out.cut.error).toBe('ECONNRESET');
  expect(out.cutSaved).toBe(0);
});

it('freezes: nothing comes back, not even an answer already on its way, and the app is left to its own limit', () => {
  expect(out.frozen.error).toBe('no answer');
  expect(out.frozenMidway.error).toBe('no answer');
});

it('slows each chunk by its wait and its rate, and still delivers all of it', () => {
  expect(out.slow).toMatchObject({ status: 200, length: 10000 });
  expect(out.slow.ms).toBeGreaterThanOrEqual(600);
});

it('holds a reply in many pieces in flight at once, as a slow link does: one latency, never one for each piece', () => {
  // Eight pieces, 20 ms apart, 300 ms of latency each way: about 900 ms in all. One wait for each
  // piece in turn would be eight of them on the reply alone, past 2.7 s.
  expect(out.slowInPieces).toMatchObject({ status: 200, length: 8 * 4096 });
  expect(out.slowInPieces.ms).toBeGreaterThanOrEqual(600);
  expect(out.slowInPieces.ms).toBeLessThan(1800);
});

it('closes a connection once its limit of bytes has gone back', () => {
  expect(out.limit.length ?? out.limit.cutAt ?? 0).toBeLessThan(10000);
});

it('passes a live channel\'s upgrade, and reads nothing after it as a request or an answer', () => {
  expect(out.upgrade).toEqual({ status: 101, echoed: true });
});

it('stops and starts one of the house\'s services, and blocks the emulator\'s DNS, by fixed commands alone', () => {
  expect(out.parts).toEqual([
    { status: 200, done: { part: 'realtime', state: 'stopped' } },
    { status: 200, done: { part: 'realtime', state: 'started' } },
    { status: 400, refused: 'a part from rest, realtime, storage, auth, and a state, stopped or started' },
    { status: 500, failed: 'docker stop supabase_storage_reelhouse-e2e: No such container' },
    { status: 200, done: { blocked: true } },
    { status: 200, done: { blocked: false } },
    { status: 400, refused: 'blocked, true or false' },
  ]);
  expect(out.ranParts).toEqual([
    'docker stop supabase_realtime_reelhouse-e2e',
    'docker start supabase_realtime_reelhouse-e2e',
    'docker stop supabase_storage_reelhouse-e2e',
    'adb shell settings put global private_dns_specifier dns.blocked.invalid',
    'adb shell settings put global private_dns_mode hostname',
    'adb shell settings put global private_dns_mode off',
  ]);
});

it('changes the phone mid-flow by fixed commands of checked values alone, and refuses anything else', () => {
  expect(out.phone).toEqual([
    { status: 200, done: { set: 'font_scale', to: 1.3 } },
    { status: 200, done: { set: 'density', to: 560 } },
    { status: 200, done: { set: 'density', to: 'reset' } },
    { status: 200, done: { set: 'dont_keep_activities', to: true } },
    { status: 200, done: { set: 'killed_in_background', to: true } },
    { status: 200, done: { set: 'force_stopped', to: true } },
    { status: 400, refused: 'font_scale to a number from 0.85 to 2' },
    { status: 400, refused: 'density to a whole number from 240 to 640, or "reset"' },
    { status: 400, refused: 'set, one of font_scale, density, dont_keep_activities, killed_in_background, force_stopped, and to' },
    { status: 400, refused: 'set, one of font_scale, density, dont_keep_activities, killed_in_background, force_stopped, and to' },
  ]);
  expect(out.ran.slice(out.ranParts.length, out.ranPhone)).toEqual([
    'adb shell settings put system font_scale 1.3',
    'adb shell wm density 560',
    'adb shell wm density reset',
    'adb shell settings put global always_finish_activities 1',
    'adb shell am kill com.reelhouse.society',
    'adb shell am force-stop com.reelhouse.society',
  ]);
});

it('runs adb from the Android SDK the runner keeps, since the proxy starts before adb is on the PATH (run 39004287263)', () => {
  const code = `const m = await import(${JSON.stringify(SCRIPT)}); console.log(JSON.stringify([
    m.toolOf('adb', { ANDROID_HOME: '/sdk' }), m.toolOf('adb', { ANDROID_SDK_ROOT: '/old' }), m.toolOf('adb', {}), m.toolOf('docker', { ANDROID_HOME: '/sdk' }),
  ]));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  expect(JSON.parse(r.stdout)).toEqual([join('/sdk', 'platform-tools', 'adb'), join('/old', 'platform-tools', 'adb'), 'adb', 'docker']);
});

it('backs the app up, reinstalls it and restores it by the plan\'s steps, each held to what Android must say', () => {
  expect(out.backup).toEqual([
    { status: 200, done: { step: 'save' } },
    { status: 200, done: { step: 'reinstall' } },
    { status: 200, done: { step: 'restore' } },
    { status: 200, done: { step: 'marker' } },
    { status: 400, refused: 'step, one of save, reinstall, restore, marker' },
  ]);
  expect(out.ran.slice(out.ranPhone, out.ranBackup)).toEqual([
    'adb shell bmgr enable true',
    'adb shell bmgr transport com.android.localtransport/.LocalTransport',
    'adb shell bmgr backupnow com.reelhouse.society',
    'adb uninstall com.reelhouse.society',
    'adb install mobile/android/app/build/outputs/apk/release/app-release.apk',
    'adb shell bmgr list sets',
    'adb shell bmgr restore 1 com.reelhouse.society',
    'adb shell ls /data/data/com.reelhouse.society/files/e2e-backup-marker',
    'adb shell ls /data/data/com.reelhouse.society/files/e2e-backup-marker',
  ]);
});

it('installs the build in members\' hands afresh, then this one over it keeping its data, and fails with no old build to install', () => {
  expect(out.upgradeAlone).toEqual({ status: 500, failed: 'no old build to upgrade from: the proxy was started without --old-apk' });
  expect(out.appUpgrade).toEqual([
    { status: 200, done: { step: 'old' } },
    { status: 200, done: { step: 'new' } },
    { status: 400, refused: 'step, one of old, new' },
  ]);
  expect(out.ran.slice(out.ranBackup)).toEqual([
    'adb uninstall com.reelhouse.society',
    'adb install /runner/old/app-release.apk',
    'adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk',
  ]);
});

it('fails a backup whose marker is not back as a mis-set run, never a pass', () => {
  expect(out.markerGone.status).toBe(500);
  expect(out.markerGone.failed).toMatch(/^the marker is not back, so the backup or the restore never happened and this run proves nothing \(a mis-set fault\): adb shell ls .* said ls: .*No such file or directory$/);
});

it('logs every request with the house\'s status and what a fault did to it', () => {
  expect(out.log).toEqual(expect.arrayContaining([
    { method: 'GET', path: '/ok', status: 200, fault: null },
    { method: 'GET', path: '/rest/v1/films?id=1', status: 503, fault: 'answered by the proxy' },
    { method: 'POST', path: '/write', status: 201, fault: 'answer lost: the house answered, the app was reset' },
    { method: 'POST', path: '/write', status: null, fault: 'cut after 40 bytes of the request' },
    { method: 'GET', path: '/realtime/v1/websocket', status: 101, fault: null },
  ]));
  expect(out.log.filter((l: { path: string }) => l.path === '/realtime/v1/websocket')).toHaveLength(1);
  // A live channel's frames are not requests, whatever they hold.
  expect(out.log.filter((l: { path: string }) => l.path === '/not-a-request')).toEqual([]);
});
