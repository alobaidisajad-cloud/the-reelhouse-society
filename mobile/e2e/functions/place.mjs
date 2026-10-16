#!/usr/bin/env node
/**
 * place.mjs — the functions world: every edge function, served as it is.
 *
 * The sealed E2E world serves a recorded TMDB stand-in and one production
 * function. The functions world (db-integration.yml, job "functions") serves
 * all of production's, from the one home each has (scripts/edge-functions.cjs),
 * and the one written but not deployed that can be served whole (SERVED_UNDEPLOYED),
 * with each outside service's address pointed at stand-ins.mjs:
 *   · e2e/supabase/functions is emptied, and each function copied in, with the
 *     shared code they import (mobile/supabase/functions/_shared);
 *   · e2e/supabase/config.toml's [functions.*] sections are written from the
 *     same list, verify_jwt as each is deployed;
 *   · e2e/supabase/functions/.env (read by `supabase start`) names the stand-ins
 *     and gives each secret a made-up value, and the suites read the same
 *     values from $GITHUB_ENV (FN_*; the stand-ins' Expo token as
 *     STAND_INS_EXPO_TOKEN).
 * It rewrites tracked files, so it runs on a CI checkout only, or with --here.
 *
 *   node mobile/e2e/functions/place.mjs [--here]
 */
import { appendFileSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const PROJECT = join(HERE, '..', 'supabase');
const FUNCTIONS = join(PROJECT, 'functions');
const CONFIG = join(PROJECT, 'config.toml');
const { DEPLOYED, NOT_DEPLOYED, MOBILE } = createRequire(import.meta.url)(join(ROOT, 'mobile', 'scripts', 'edge-functions.cjs'));

/**
 * Written, not deployed, and served here all the same, with how it would be
 * deployed: send-email is called by the house alone, behind its own secret.
 */
export const SERVED_UNDEPLOYED = {
  'send-email': { verifyJwt: false },
};

/** Written, not deployed, and not served, each with why. */
export const NOT_SERVED = {
  'paytabs-handler': 'web payments wait for PayTabs to be verified server to server (edge-functions.cjs says why it is not deployed); it is served and asked when they are built, with a PayTabs stand-in',
};

/** Every function the functions world serves: the deployed ones, and SERVED_UNDEPLOYED from their home. */
export const SERVED = {
  ...DEPLOYED,
  ...Object.fromEntries(Object.entries(SERVED_UNDEPLOYED).map(([name, f]) => [name, { dir: NOT_DEPLOYED[name]?.dir, ...f }])),
};

/**
 * The stand-ins, run on the runner itself (db-integration.yml), as the functions'
 * container reaches the runner: the Supabase CLI names it host.docker.internal
 * there. warm.mjs proves a function reaches it before anything else runs.
 */
export const STAND_INS = 'http://host.docker.internal:54990';

/** Every outside address a served function reads from its settings, each pointed at the stand-ins. */
export const ADDRESSES = {
  EXPO_PUSH_URL: `${STAND_INS}/--/api/v2/push/send`,
  REVENUECAT_API_URL: `${STAND_INS}/v1`,
  TMDB_ORIGIN: STAND_INS,
  FEED_ORIGIN: STAND_INS,
  RESEND_API_URL: STAND_INS,
};

/** notify-push's Expo access token here: a fixed value, no secret, that the Expo stand-in asks for. */
export const EXPO_ACCESS_TOKEN = 'functions-world-expo-access-token';

/** The [functions.*] sections for these functions: verify_jwt as each is deployed. */
export function functionSections(served) {
  return Object.entries(served)
    .map(([name, f]) => `[functions.${name}]\nverify_jwt = ${f.verifyJwt}\n`)
    .join('\n');
}

/** config.toml with its [functions.*] sections, and the comments just above them, replaced by these. */
export function withSections(config, sections) {
  const lines = config.replace(/\r\n/g, '\n').split('\n');
  let cut = lines.findIndex((l) => l.startsWith('[functions.'));
  if (cut === -1) cut = lines.length;
  while (cut > 0 && lines[cut - 1].startsWith('#')) cut -= 1;
  const kept = lines.slice(0, cut);
  const rest = lines.slice(cut).filter((l) => l.startsWith('[') && !l.startsWith('[functions.'));
  if (rest.length) throw new Error(`a section follows the functions' and would be lost: ${rest.join(', ')}`);
  return `${kept.join('\n').trimEnd()}\n\n# The functions world (e2e/functions/place.mjs): every function served, as deployed.\n${sections}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.env.GITHUB_ACTIONS !== 'true' && !process.argv.includes('--here')) {
    console.error('place.mjs rewrites e2e/supabase for the functions world; on a CI checkout only, or with --here.');
    process.exit(2);
  }

  rmSync(FUNCTIONS, { recursive: true, force: true });
  for (const [name, f] of Object.entries(SERVED)) {
    const from = join(ROOT, f.dir ?? '', name);
    if (!f.dir || !existsSync(join(from, 'index.ts'))) throw new Error(`${name}: no index.ts in ${f.dir}`);
    cpSync(from, join(FUNCTIONS, name), { recursive: true });
  }
  cpSync(join(ROOT, MOBILE, '_shared'), join(FUNCTIONS, '_shared'), { recursive: true });

  writeFileSync(CONFIG, withSections(readFileSync(CONFIG, 'utf8'), functionSections(SERVED)));

  const made = () => randomBytes(18).toString('hex');
  const secrets = {
    FUNCTION_SHARED_SECRET: made(),
    REVENUECAT_WEBHOOK_SECRET: `Bearer ${made()}`,
    REVENUECAT_SECRET_KEY: `sk_standin_${made()}`,
    TMDB_API_KEY: made(),
    RESEND_API_KEY: `re_standin_${made()}`,
  };
  const env = { ...ADDRESSES, ...secrets, EXPO_ACCESS_TOKEN };
  // Quoted: the webhook's secret is a whole Authorization header, a space in it.
  writeFileSync(join(FUNCTIONS, '.env'), Object.entries(env).map(([k, v]) => `${k}="${v}"`).join('\n') + '\n');
  if (process.env.GITHUB_ENV) {
    for (const v of Object.values(secrets)) console.log(`::add-mask::${v}`);
    appendFileSync(process.env.GITHUB_ENV, Object.entries(secrets).map(([k, v]) => `FN_${k}=${v}\n`).join('')
      + `STAND_INS_EXPO_TOKEN=${EXPO_ACCESS_TOKEN}\n`);
  }

  console.log(`placed ${Object.keys(SERVED).sort().join(', ')} and _shared; outside addresses → ${STAND_INS}`);
}
