#!/usr/bin/env node
/**
 * scrub.mjs — the run's files lose the member's password before they are kept.
 *
 *   node e2e/scrub.mjs <dir or file>...
 *
 * e2e.yml keeps the run's files (Maestro's records, the device's log) as an
 * artifact. Maestro's step record holds each command as it ran, values filled
 * in, so a seeded account's password (E2E_MEMBER_PASSWORD, E2E_ADMIN_PASSWORD: every
 * E2E_<WHO>_PASSWORD the run holds) can sit in it in the clear. Each is new on every
 * run and its database dies with the runner, but it is still a password: every text
 * file under each <dir> has it replaced with *** (read and written byte for byte, so
 * no file's encoding is touched).
 * Pictures and video are left alone (they hold no text to replace).
 * Prints how many files it changed.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/** Every seeded account's password the run holds, by the names the seed gives them. */
const secrets = Object.entries(process.env).filter(([k, v]) => /^E2E_[A-Z]+_PASSWORD$/.test(k) && v).map(([, v]) => v);
const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.zip', '.gz', '.apk']);
let changed = 0;
const visit = (p) => {
  let s;
  try { s = statSync(p); } catch { return; } // a path the run never wrote
  if (s.isDirectory()) { for (const e of readdirSync(p)) visit(join(p, e)); return; }
  if (BINARY.has(extname(p).toLowerCase()) || s.size > 64 * 1024 * 1024) return;
  const text = readFileSync(p, 'latin1');
  if (!secrets.some((secret) => text.includes(secret))) return;
  writeFileSync(p, secrets.reduce((t, secret) => t.split(secret).join('***'), text), 'latin1');
  changed++;
};
if (secrets.length) for (const p of process.argv.slice(2)) visit(p);
console.log(secrets.length ? `scrubbed the passwords from ${changed} file${changed === 1 ? '' : 's'}` : 'no password to scrub (no E2E_<WHO>_PASSWORD is set)');
