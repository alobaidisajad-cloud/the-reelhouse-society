/**
 * Every edge function: which folder holds its one copy, and how it is deployed.
 *
 * Two folders hold functions — supabase/functions (the web's tree) and
 * mobile/supabase/functions — and both deploy to the same project. They once
 * held four same-named functions, every pair different, and only one of each
 * was running. Reading the repo did not tell you what ran, and the copy that
 * leaked the TMDB key was one nobody was reading.
 *
 * So each function has exactly ONE copy, named here, and it is the one that
 * runs:
 *   · edgeFunctions.guard.test.ts — every folder is listed, in the right tree,
 *     and no name is in both.
 *   · npm run functions:check — downloads every deployed function and
 *     compares it with its copy here, file by file, and its verify_jwt.
 *
 * verifyJwt is the deploy flag. There is no config.toml to hold it, so a
 * redeploy without `--no-verify-jwt` silently puts a gate in front of a
 * function that must be open — visitors reading the news, the database
 * calling notify-push, RevenueCat calling its webhook.
 */
const WEB = 'supabase/functions';
const MOBILE = 'mobile/supabase/functions';

/** Deployed. Paths are from the repository root. */
const DEPLOYED = {
  'tmdb-proxy': { dir: WEB, verifyJwt: false }, // the apps' only road to TMDB; guarded by paths.js
  'sign-in-with-username': { dir: WEB, verifyJwt: false }, // called before there is a session
  'sync-films': { dir: WEB, verifyJwt: true },
  'paytabs-handler': { dir: WEB, verifyJwt: true },
  'fetch-rss': { dir: MOBILE, verifyJwt: false }, // read by visitors
  'notify-push': { dir: MOBILE, verifyJwt: false }, // called by the database; checks FUNCTION_SHARED_SECRET
  'sync-entitlement': { dir: MOBILE, verifyJwt: true },
  'revenuecat-webhook': { dir: MOBILE, verifyJwt: false }, // called by RevenueCat, checks its own secret
};

/** In the repo on purpose, not deployed — and why. */
const NOT_DEPLOYED = {
  'send-email': {
    dir: WEB,
    why: 'Welcome and digest emails, written but never deployed. Nothing calls it; support mail goes through Resend SMTP.',
  },
};

/**
 * The command that deploys a function the way this file says it is deployed —
 * printed by functions:check, so no one types the flags from memory.
 */
const deployCommand = (name) => {
  const f = DEPLOYED[name];
  const cwd = f.dir === MOBILE ? 'mobile' : '.';
  return `cd ${cwd}; npx supabase functions deploy ${name} --use-api${f.verifyJwt ? '' : ' --no-verify-jwt'}`;
};

module.exports = { WEB, MOBILE, DEPLOYED, NOT_DEPLOYED, deployCommand };
