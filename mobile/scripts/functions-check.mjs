#!/usr/bin/env node
/**
 * functions-check.mjs — is what runs what the repo says runs?
 *
 *   npm run functions:check
 *
 * schema:check does this for the database. This does it for the edge
 * functions: it lists what is deployed, downloads each one, and compares it
 * file by file with its one copy in the repo (edge-functions.cjs says where),
 * and checks each one's verify_jwt. It reports:
 *
 *   · deployed, but not in edge-functions.cjs   — something nobody owns is live
 *   · in edge-functions.cjs, but not deployed   — a function the apps call is missing
 *   · verify_jwt differs                        — a gate added or dropped by a redeploy
 *   · source differs                            — what runs is not what you are reading
 *
 * Read-only: it lists and downloads, never deploys. It needs the Supabase CLI
 * to be logged in (`npx supabase login`).
 *
 * Two differences are not differences, and are ignored: line endings (git on
 * Windows checks files out as CRLF, and a deploy uploads them as they are on
 * disk) and whitespace at the very end of a file (a function pasted into the
 * dashboard loses its final newline). Neither changes what runs.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import fns from './edge-functions.cjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const CLI = ['-y', 'supabase@2.118.0'];

// The project the production app talks to, read from the build it ships in.
const eas = JSON.parse(readFileSync(join(HERE, '..', 'eas.json'), 'utf8'));
const REF = new URL(eas.build.production.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

const supabase = (args, cwd) =>
  execFileSync('npx', [...CLI, ...args, '--project-ref', REF], { cwd, encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });

/** Every file under a folder, as relative path → text with LF endings and no trailing whitespace. */
const filesIn = (root) => {
  const out = new Map();
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(root, p).split('\\').join('/'), readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trimEnd());
    }
  };
  if (existsSync(root)) walk(root);
  return out;
};

let listed;
try {
  const raw = supabase(['functions', 'list', '-o', 'json'], REPO);
  // The CLI may print a notice before the JSON; start at the first bracket.
  const parsed = JSON.parse(raw.slice(raw.search(/[[{]/)));
  listed = Array.isArray(parsed) ? parsed : parsed.functions;
} catch (e) {
  console.error('Could not list the deployed functions. Is the CLI logged in? (npx supabase login)');
  console.error('  ' + String(e.stderr || e.message).split('\n').find((l) => l.trim()));
  process.exit(2);
}

const problems = [];
const live = new Map(listed.map((f) => [f.slug, f]));

for (const slug of live.keys()) {
  if (!fns.DEPLOYED[slug]) {
    problems.push(`deployed, but not in edge-functions.cjs: ${slug} (named "${live.get(slug).name}") — nobody owns it. Delete it, or give it a home.`);
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'functions-check-'));
try {
  for (const [slug, want] of Object.entries(fns.DEPLOYED)) {
    const fn = live.get(slug);
    if (!fn) {
      problems.push(`not deployed: ${slug} — deploy it:\n      ${fns.deployCommand(slug)}`);
      continue;
    }
    if (fn.verify_jwt !== want.verifyJwt) {
      problems.push(`verify_jwt is ${fn.verify_jwt}, should be ${want.verifyJwt}: ${slug} — redeploy:\n      ${fns.deployCommand(slug)}`);
    }
    supabase(['functions', 'download', slug, '--use-api'], scratch);
    const running = filesIn(join(scratch, 'supabase', 'functions', slug));
    const repo = filesIn(join(REPO, want.dir, slug));
    const names = [...new Set([...running.keys(), ...repo.keys()])].sort();
    const differ = names.filter((n) => running.get(n) !== repo.get(n)).map((n) =>
      !running.has(n) ? `${n} (not deployed)` : !repo.has(n) ? `${n} (not in the repo)` : n);
    if (differ.length) {
      problems.push(`source differs: ${slug} — ${differ.join(', ')}\n      the repo copy is ${want.dir}/${slug}; if it is right, deploy it:\n      ${fns.deployCommand(slug)}`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

for (const [slug, { why }] of Object.entries(fns.NOT_DEPLOYED)) {
  if (live.has(slug)) problems.push(`deployed, but edge-functions.cjs says it is not: ${slug}`);
  else console.log(`  (not deployed, on purpose: ${slug} — ${why})`);
}

if (!problems.length) {
  console.log(`✓ All ${Object.keys(fns.DEPLOYED).length} deployed functions match their one copy in the repo, and their verify_jwt.`);
  process.exit(0);
}
console.error(`\n✗ ${problems.length} problem(s):\n`);
for (const p of problems) console.error('  · ' + p);
process.exit(1);
