/**
 * everyMemberKeyHasAnEraser.test.ts — what a member leaves on the phone.
 * ─────────────────────────────────────────────────────────────────────────────
 * Three separate leaks of one shape have been found in this project, each by
 * reading a different file on a different day:
 *
 *   four DRAFT keys      a member's unfinished essays and private notes
 *   two FOLLOW caches    their social graph and pending requests
 *   the DEAD-LETTER queue  failed critiques and lounge messages, with bodies
 *
 * Every one was written to disk under a per-member key and never erased, so it
 * stayed on the device after they signed out and the next person to sign in was
 * carrying it. Each fix was correct and local; none of them asked the question
 * everywhere. This does.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * A key prefix written to disk must also be ERASED somewhere — by name, or by a
 * prefix sweep. The exemptions are listed with their reasons, and an exemption
 * that stops being written is itself a failure, so the list cannot rot.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const sources = (): { f: string; src: string }[] =>
  execFileSync('git', ['ls-files', 'src', 'app'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\.|\.d\.ts$/.test(f))
    .map((f) => ({ f, src: stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')) }));

/**
 * Storage key prefixes, taken from the literal that opens the key. A key is
 * either `'literal_' + something` or a bare `'literal'`.
 */
const prefixesIn = (text: string, call: RegExp): Set<string> => {
  const out = new Set<string>();
  for (const m of text.matchAll(call)) {
    const keyExpr = m[1];
    const lit = /['"`]([A-Za-z][A-Za-z0-9_-]*)/.exec(keyExpr);
    if (lit) out.add(lit[1].replace(/_+$/, ''));
  }
  return out;
};

/**
 * Keys that are written and deliberately NOT erased, each with its reason.
 * Every entry must still be written, or it is stale and this test says so.
 */
const KEPT_ON_PURPOSE: Record<string, string> = {
  reelhouse_initiation:
    'A boolean: has this member seen the initiation. Erasing it at logout would ' +
    'show the modal again to someone signing back in. It carries no content — ' +
    'only that a member with this id used this device — and shouldInitiate also ' +
    'requires a newborn account, so it cannot resurface later.',

  reelhouse_has_launched:
    'Device-level, not member-level: has this INSTALL ever opened. It drives the ' +
    'first-launch ceremony in Preloader. No member id, no member content, and ' +
    'erasing it would replay the ceremony for whoever signs in next — which is ' +
    'the opposite of what a logout should do.',
};

describe('nothing a member wrote stays on the phone after they leave', () => {
  it('finds writes and erasures — neither sweep is empty', () => {
    const all = sources().map((s) => s.src).join('\n');
    const written = prefixesIn(all, /(?:storage\.set|setSensitive)\(\s*([^,]+),/g);
    expect(written.size).toBeGreaterThanOrEqual(5);
    expect(/storage\.delete\(/.test(all)).toBe(true);
  });

  it('EVERY key prefix written to disk is erased somewhere — enumerated', () => {
    const all = sources().map((s) => s.src).join('\n');

    const written = prefixesIn(all, /(?:storage\.set|setSensitive)\(\s*([^,]+),/g);
    const erased = prefixesIn(all, /storage\.delete\(\s*([^)]+)\)/g);

    // A prefix sweep erases by `startsWith`, so whatever constant it tests
    // against covers every key beginning with it.
    for (const m of all.matchAll(/startsWith\(\s*([^)]+)\)/g)) {
      const lit = /['"`]([A-Za-z][A-Za-z0-9_-]*)/.exec(m[1]);
      if (lit) erased.add(lit[1].replace(/_+$/, ''));
      // `startsWith(mine)` / `startsWith(QUEUE_KEY)` name a constant; resolve it.
      const ident = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(m[1]);
      if (ident) {
        const decl = new RegExp(`(?:const|let)\\s+${ident[1]}\\s*=\\s*[^\\n]*?['"\`]([A-Za-z][A-Za-z0-9_-]*)`).exec(all);
        if (decl) erased.add(decl[1].replace(/_+$/, ''));
      }
    }

    const orphans = [...written].filter((p) => !erased.has(p) && !(p in KEPT_ON_PURPOSE));
    expect(orphans).toEqual([]);
  });

  it('every deliberate exception is still actually written — the list cannot rot', () => {
    const all = sources().map((s) => s.src).join('\n');
    const stale = Object.keys(KEPT_ON_PURPOSE).filter((p) => !all.includes(p));
    expect(stale).toEqual([]);
  });

  it('the detector can SEE an unerased key — not passing on an empty sweep', () => {
    const sample = "storage.set(`brandnewcache_${userId}`, JSON.stringify(x));";
    const found = prefixesIn(sample, /(?:storage\.set|setSensitive)\(\s*([^,]+),/g);
    expect([...found]).toEqual(['brandnewcache']);
  });
});
