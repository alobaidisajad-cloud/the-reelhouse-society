#!/usr/bin/env node
/**
 * scrub.mjs — the run's files lose the member's password before they are kept.
 *
 *   node e2e/scrub.mjs <dir or file>...
 *
 * e2e.yml keeps the run's files (Maestro's records, the device's log) as an
 * artifact. Maestro's step record holds each command as it ran, values filled
 * in, so the seeded member's password (E2E_MEMBER_PASSWORD) can sit in it in
 * the clear. It is new on every run and its database dies with the runner,
 * but it is still a password: every text file under each <dir> has it replaced
 * with *** (read and written byte for byte, so no file's encoding is touched).
 * Pictures and video are left alone (they hold no text to replace).
 * Prints how many files it changed.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const secret = process.env.E2E_MEMBER_PASSWORD;
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.zip', '.gz', '.apk']);
let changed = 0;
const visit = (p) => {
  let s;
  try { s = statSync(p); } catch { return; } // a path the run never wrote
  if (s.isDirectory()) { for (const e of readdirSync(p)) visit(join(p, e)); return; }
  if (BINARY.has(extname(p).toLowerCase()) || s.size > 64 * 1024 * 1024) return;
  const text = readFileSync(p, 'latin1');
  if (!text.includes(secret)) return;
  writeFileSync(p, text.split(secret).join('***'), 'latin1');
  changed++;
};
if (secret) for (const p of process.argv.slice(2)) visit(p);
console.log(secret ? `scrubbed the password from ${changed} file${changed === 1 ? '' : 's'}` : 'no password to scrub (E2E_MEMBER_PASSWORD is not set)');
