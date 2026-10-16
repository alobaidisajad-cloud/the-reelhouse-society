#!/usr/bin/env node
/**
 * fault-proxy.mjs — the network between the app and the sealed house, with a fault on command
 * (WORKLIST P0.73), and the record of every request that crossed it (P0.75's gateway log).
 *
 *   node e2e/fault-proxy.mjs [--listen 54330] [--to 127.0.0.1:54321] [--control 54331] [--log <file>]
 *
 * Every connection is piped as bytes both ways, so with no fault set the app meets the house as it
 * would without it: keep-alive, chunked answers and the live channels' upgrade pass untouched. Only
 * each request's first line and each answer's status line are read, for the log and the route
 * faults. A fault is set on the control port, which a flow reaches from the emulator at 10.0.2.2:
 *
 *   POST   /fault   {"kind": …}   sets it, for the requests and connections from then on
 *   DELETE /fault                 clears it
 *   GET    /log                   every request: method, path, when, the house's status, and what a fault did
 *   DELETE /log                   empties it
 *   POST   /part   {"part": …, "state": "stopped"|"started"}   one of the house's services stopped or
 *                  started on the runner (P0.74): rest (the database API), realtime (the live channels),
 *                  storage, auth. An edge function is stopped as its route, by an `http` fault.
 *   POST   /dns    {"blocked": true|false}   the emulator's Wi-Fi left up with its DNS blocked: Android's
 *                  private DNS pointed at a name that resolves nowhere, so every host name fails and
 *                  10.0.2.2 still answers
 *   GET    /alive
 *
 * Both listen on the runner's loopback alone; the emulator reaches it as 10.0.2.2.
 *
 * The faults:
 *   slow          {latencyMs, jitterMs, bytesPerSecond}  each chunk waits latency ± jitter, then goes at that rate
 *                 (the plan's EDGE: 3000 ± 1000 ms, 20 KB/s)
 *   frozen        nothing passes either way; the connections stay open, as a hung link does
 *   cut           {afterBytes, route?, times?}  a request is reset once that many of its bytes have passed:
 *                 cut halfway, the house never has it whole
 *   answer-lost   {route?, times?}  the request reaches the house whole, and its answer's first byte resets
 *                 the app's connection instead: the house did it, the app never hears so
 *   limit         {bytes}  each connection is closed once that many bytes have gone back to the app
 *   http          {route, status}  a request whose path matches is answered with an HTML page of that
 *                 status (500, 502 or 503), as a gateway in trouble answers, and never sent on
 * A route is a regular expression over the path. `http` holds until cleared; `cut` and `answer-lost`
 * take `times` requests (one unless told more).
 */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { connect, createServer } from 'node:net';
import { pathToFileURL } from 'node:url';

const METHODS = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\S+) HTTP\/1\.[01]\r\n/;
const STATUS = /^HTTP\/1\.[01] (\d{3})/;
const REASONS = { 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };

/** What a fault must hold, by kind: its fields' checks. A fault that names a field wrongly is refused. */
const KINDS = {
  slow: { latencyMs: (v) => Number.isInteger(v) && v >= 0, jitterMs: (v) => Number.isInteger(v) && v >= 0, bytesPerSecond: (v) => Number.isInteger(v) && v > 0 },
  frozen: {},
  cut: { afterBytes: (v) => Number.isInteger(v) && v >= 0, route: (v) => v === undefined || typeof v === 'string', times: (v) => v === undefined || (Number.isInteger(v) && v > 0) },
  'answer-lost': { route: (v) => v === undefined || typeof v === 'string', times: (v) => v === undefined || (Number.isInteger(v) && v > 0) },
  limit: { bytes: (v) => Number.isInteger(v) && v > 0 },
  http: { route: (v) => typeof v === 'string', status: (v) => v in REASONS },
};

/** Why a fault cannot be set, or null when it can. */
export const refusalOf = (fault) => {
  if (!fault || !(fault.kind in KINDS)) return `a kind from ${Object.keys(KINDS).join(', ')}`;
  const fields = KINDS[fault.kind];
  const extra = Object.keys(fault).filter((k) => k !== 'kind' && !(k in fields));
  if (extra.length) return `${fault.kind} takes no ${extra.join(', ')}`;
  const wrong = Object.entries(fields).filter(([k, ok]) => !ok(fault[k])).map(([k]) => k);
  if (wrong.length) return `${fault.kind} needs ${wrong.join(', ')}`;
  if (fault.route !== undefined) { try { new RegExp(fault.route); } catch { return `route is not a regular expression: ${fault.route}`; } }
  return null;
};

const htmlPage = (status) => {
  const body = `<!DOCTYPE html><html><head><title>${status} ${REASONS[status]}</title></head><body><h1>${status} ${REASONS[status]}</h1><p>The fault proxy answered.</p></body></html>`;
  return `HTTP/1.1 ${status} ${REASONS[status]}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`;
};

/** The house's services a flow may stop, as the local stack names their containers. */
export const PARTS = ['rest', 'realtime', 'storage', 'auth'];
const STACK = 'reelhouse-e2e';

/** The runner commands each control asks for, as [command, args] lists; nothing else is ever run. */
export const commandsFor = {
  part: ({ part, state }) => [['docker', [state === 'stopped' ? 'stop' : 'start', `supabase_${part}_${STACK}`]]],
  dns: ({ blocked }) => (blocked
    ? [['adb', ['shell', 'settings', 'put', 'global', 'private_dns_specifier', 'dns.blocked.invalid']],
      ['adb', ['shell', 'settings', 'put', 'global', 'private_dns_mode', 'hostname']]]
    : [['adb', ['shell', 'settings', 'put', 'global', 'private_dns_mode', 'off']]]),
};
const refusalOfPart = (b) => (PARTS.includes(b?.part) && ['stopped', 'started'].includes(b?.state) && Object.keys(b).length === 2
  ? null : `a part from ${PARTS.join(', ')}, and a state, stopped or started`);
const refusalOfDns = (b) => (typeof b?.blocked === 'boolean' && Object.keys(b).length === 1 ? null : 'blocked, true or false');

/** Runs one runner command; its exit and its own words. */
const runCommand = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60_000 });
  return { status: r.status, said: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() || (r.error?.message ?? '') };
};

/** The proxy and its control server; resolves once both listen, with their ports, the log and close(). */
export function startProxy({ listen = 0, to, control = 0, logFile = null, run = runCommand } = {}) {
  const [toHost, toPort] = to.split(':');
  let fault = null;
  let left = 0;
  const log = [];
  let next = 1;
  const sockets = new Set();
  const record = (entry) => { if (logFile) appendFileSync(logFile, `${JSON.stringify(entry)}\n`); };
  /** Whether the fault in force takes this request: its route matches and it has requests left. */
  const takes = (path) => !!fault && (fault.route === undefined || new RegExp(fault.route).test(path)) && left > 0;

  /**
   * A direction's sender: under `slow`, each chunk after its wait and at the rate, in order; else at
   * once. `after` runs its step once every chunk sent before it has gone, so a side's end follows
   * its last bytes rather than overtaking them.
   */
  const sender = (to) => {
    let chain = Promise.resolve();
    return {
      send(chunk) {
        if (fault?.kind !== 'slow') { chain = chain.then(() => { if (!to.destroyed) to.write(chunk); }); return; }
        const { latencyMs, jitterMs, bytesPerSecond } = fault;
        const wait = latencyMs + Math.round((Math.random() * 2 - 1) * jitterMs) + Math.ceil((chunk.length / bytesPerSecond) * 1000);
        chain = chain.then(() => new Promise((r) => setTimeout(r, Math.max(0, wait)))).then(() => { if (!to.destroyed) to.write(chunk); });
      },
      after(step) { chain = chain.then(step); },
    };
  };

  const proxy = createServer({ allowHalfOpen: true }, (app) => {
    const house = connect({ port: Number(toPort), host: toHost, allowHalfOpen: true });
    sockets.add(app); sockets.add(house);
    const pending = [];
    let upgraded = false;
    let request = null;
    let sentBack = 0;
    const toHouse = sender(house);
    const toApp = sender(app);
    const end = () => { app.destroy(); house.destroy(); };
    app.on('error', end); house.on('error', end);
    // Each side's end crosses after the bytes it sent; a side gone takes the other with it. While
    // frozen, the house's end does not cross either: a hung link tells the app nothing.
    app.on('end', () => toHouse.after(() => { if (!house.destroyed) house.end(); }));
    house.on('end', () => { if (fault?.kind !== 'frozen') toApp.after(() => { if (!app.destroyed) app.end(); }); });
    app.on('close', () => { house.destroy(); sockets.delete(app); });
    house.on('close', () => { sockets.delete(house); if (fault?.kind !== 'frozen') toApp.after(() => app.destroy()); });

    app.on('data', (chunk) => {
      const line = upgraded ? null : METHODS.exec(chunk.toString('latin1', 0, Math.min(chunk.length, 4096)));
      if (line) {
        request = { id: next++, method: line[1], path: line[2], at: new Date().toISOString(), status: null, fault: null, bytes: 0 };
        log.push(request);
        if (fault?.kind === 'http' && takes(request.path)) {
          left -= 1;
          request.status = fault.status;
          request.fault = 'answered by the proxy';
          record(request);
          app.end(htmlPage(fault.status));
          house.destroy();
          return;
        }
        if ((fault?.kind === 'answer-lost' || fault?.kind === 'cut') && takes(request.path)) { left -= 1; request.taken = fault.kind; request.afterBytes = fault.afterBytes; }
        pending.push(request);
      }
      if (fault?.kind === 'frozen') return;
      if (request?.taken === 'cut') {
        const room = request.afterBytes - request.bytes;
        if (chunk.length >= room) {
          if (room > 0) house.write(chunk.subarray(0, room));
          request.fault = `cut after ${request.afterBytes} bytes of the request`;
          record(request);
          app.resetAndDestroy();
          house.destroy();
          return;
        }
      }
      if (request) request.bytes += chunk.length;
      toHouse.send(chunk);
    });

    house.on('data', (chunk) => {
      const line = upgraded ? null : STATUS.exec(chunk.toString('latin1', 0, 16));
      if (line) {
        const answered = pending.shift();
        if (answered) {
          answered.status = Number(line[1]);
          if (answered.status === 101) upgraded = true;
          if (answered.taken === 'answer-lost') {
            answered.fault = 'answer lost: the house answered, the app was reset';
            record(answered);
            app.resetAndDestroy();
            house.destroy();
            return;
          }
          record(answered);
        }
      }
      if (fault?.kind === 'frozen') return;
      if (fault?.kind === 'limit') {
        const room = fault.bytes - sentBack;
        if (chunk.length >= room) {
          if (room > 0) app.write(chunk.subarray(0, room));
          app.destroy();
          house.destroy();
          return;
        }
      }
      sentBack += chunk.length;
      toApp.send(chunk);
    });
  });

  const answer = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const controller = createHttpServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/alive') return answer(res, 200, { alive: true });
      if (req.url === '/log' && req.method === 'GET') return answer(res, 200, log);
      if (req.url === '/log' && req.method === 'DELETE') { log.length = 0; return answer(res, 200, { log: 'emptied' }); }
      if (req.url === '/fault' && req.method === 'DELETE') { fault = null; left = 0; return answer(res, 200, { fault: null }); }
      for (const [path, refusal, commands] of [['/part', refusalOfPart, commandsFor.part], ['/dns', refusalOfDns, commandsFor.dns]]) {
        if (req.url !== path || req.method !== 'POST') continue;
        let asked;
        try { asked = JSON.parse(body); } catch { return answer(res, 400, { refused: 'the body is not JSON' }); }
        const why = refusal(asked);
        if (why) return answer(res, 400, { refused: why });
        for (const [cmd, args] of commands(asked)) {
          const r = run(cmd, args);
          if (r.status !== 0) return answer(res, 500, { failed: `${cmd} ${args.join(' ')}: ${r.said}` });
        }
        return answer(res, 200, { done: asked });
      }
      if (req.url === '/fault' && req.method === 'POST') {
        let asked;
        try { asked = JSON.parse(body); } catch { return answer(res, 400, { refused: 'the body is not JSON' }); }
        const why = refusalOf(asked);
        if (why) return answer(res, 400, { refused: why });
        fault = asked;
        // A route's answer holds until cleared, as a stopped service does; a cut or a lost answer takes one request unless told more.
        left = asked.kind === 'http' ? Infinity : asked.times ?? 1;
        return answer(res, 200, { fault });
      }
      return answer(res, 404, { refused: `no ${req.method} ${req.url}` });
    });
  });

  return new Promise((resolve, reject) => {
    proxy.once('error', reject);
    controller.once('error', reject);
    proxy.listen(listen, '127.0.0.1', () => controller.listen(control, '127.0.0.1', () => resolve({
      port: proxy.address().port,
      controlPort: controller.address().port,
      log,
      close: () => new Promise((done) => {
        for (const s of sockets) s.destroy();
        proxy.close(() => controller.close(() => done()));
      }),
    })));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; };
  const p = await startProxy({ listen: Number(arg('--listen', '54330')), to: arg('--to', '127.0.0.1:54321'), control: Number(arg('--control', '54331')), logFile: arg('--log', null) });
  console.log(`fault proxy: :${p.port} → ${arg('--to', '127.0.0.1:54321')}, control on :${p.controlPort}`);
}
