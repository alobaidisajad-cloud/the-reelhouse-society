#!/usr/bin/env node
/**
 * ios-crash.mjs — the newest iOS crash report for the app, in a few lines:
 * what was thrown, why it ended, and the top of the crashed thread.
 *
 *   node e2e/study/ios-crash.mjs [reports-dir=~/Library/Logs/DiagnosticReports]
 *
 * An .ips file is one JSON header line, then the JSON body.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir = process.argv[2] ?? join(homedir(), 'Library', 'Logs', 'DiagnosticReports');
if (!existsSync(dir)) { console.log(`no reports folder: ${dir}`); process.exit(0); }
const files = readdirSync(dir)
  .filter((f) => /reelhouse|society/i.test(f) && /\.(ips|crash)$/.test(f))
  .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
if (!files.length) { console.log('no crash report for the app'); process.exit(0); }
const raw = readFileSync(join(dir, files[0].f), 'utf8');
console.log(`report: ${files[0].f} (${files.length} in all)`);
const nl = raw.indexOf('\n');
let body;
try { body = JSON.parse(raw.slice(nl + 1)); } catch { console.log(raw.split('\n').slice(0, 40).join('\n')); process.exit(0); }
const ex = body.exception ?? {};
console.log(`exception: ${ex.type ?? '?'} ${ex.signal ?? ''} ${ex.codes ?? ''}`);
if (body.termination) console.log(`termination: ${JSON.stringify(body.termination).slice(0, 400)}`);
if (body.asi) console.log(`asi: ${JSON.stringify(body.asi).slice(0, 700)}`);
const images = body.usedImages ?? [];
const frameText = (fr) => `${images[fr.imageIndex]?.name ?? '?'}  ${fr.symbol ?? ''}${fr.symbolLocation ? `+${fr.symbolLocation}` : ''}`;
if (body.lastExceptionBacktrace) {
  console.log('last exception backtrace:');
  for (const fr of body.lastExceptionBacktrace.slice(0, 12)) console.log(`  ${frameText(fr)}`);
}
const crashed = (body.threads ?? []).find((t) => t.triggered);
if (crashed) {
  console.log(`crashed thread: ${crashed.name ?? crashed.queue ?? ''}`);
  for (const fr of (crashed.frames ?? []).slice(0, 14)) console.log(`  ${frameText(fr)}`);
}
