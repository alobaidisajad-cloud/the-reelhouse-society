/**
 * The shapes a key or token takes — used to refuse writing one into the repo.
 *
 * schema-snapshot.mjs records cron commands and policy expressions, which are
 * free text, and a job that calls an HTTP endpoint is usually written with its
 * bearer token inline. A committed snapshot is public (the repo is public).
 */
const SECRET_SHAPES = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // a JWT — the anon and service_role keys are JWTs
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/, // payment-provider keys
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/, // Supabase's newer API keys
  /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/, // a Resend key
];

/** The first thing in `text` shaped like a secret: which shape, and on which line. Null if none. */
const findSecret = (text) => {
  for (const re of SECRET_SHAPES) {
    const m = re.exec(text);
    if (m) return { shape: String(re), line: text.slice(0, m.index).split('\n').length };
  }
  return null;
};

module.exports = { findSecret, SECRET_SHAPES };
