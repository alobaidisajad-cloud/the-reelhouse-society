/**
 * The secrets scan cannot be quietly loosened.
 * ─────────────────────────────────────────────────────────────────────────────
 * gitleaks runs on every push (god_tier_ci.yml, the secrets job) with the
 * repo's rules (.gitleaks.toml) and its baseline (.gitleaksignore). Either file
 * could turn it blind: a rule dropped, a path allowed, a fingerprint excused
 * with no reason. This holds both, and holds the job that runs them; that each
 * rule fires is proven against the real scanner by scripts/secrets-planted.cjs.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8').split('\r\n').join('\n');
const CONFIG = read('.gitleaks.toml');
const BASELINE = read('.gitleaksignore');
const CI = read('.github/workflows/god_tier_ci.yml');

const REASONS = ['dead', 'rotated', 'retired', 'public by design', 'test value'];

/** Each fingerprint with the reason it sits under (the last `# reason:` line above it). */
const judged = (text: string) => {
  let reason: string | null = null;
  return text.split('\n').flatMap((line) => {
    const heading = line.match(/^# ([a-z ]+):/);
    if (heading) reason = heading[1];
    else if (line.trim() === '') reason = null;
    if (line.startsWith('#') || !line.trim()) return [];
    return [{ fingerprint: line.trim(), reason }];
  });
};

it('keeps gitleaks\' own rules and the four shapes they miss', () => {
  expect(CONFIG).toMatch(/\[extend\]\nuseDefault = true/);
  const ids = [...CONFIG.matchAll(/^id = "([^"]+)"/gm)].map((m) => m[1]);
  expect(ids).toEqual(['supabase-personal-token', 'postgres-url-password', 'password-in-code', 'vapid-private-key']);
});

it('allows no path, and one value: the local stack\'s default password', () => {
  expect(CONFIG).not.toMatch(/^\s*paths\s*=/m);
  expect(CONFIG).not.toMatch(/^\[allowlist\]/m);
  expect([...CONFIG.matchAll(/^regexes = (.*)$/gm)].map((m) => m[1])).toEqual(["['''^postgres$''']"]);
});

it('excuses each finding by its fingerprint alone, under a reason from the list', () => {
  const entries = judged(BASELINE);
  expect(entries.length).toBeGreaterThanOrEqual(12);
  const bad = entries.filter((e) => !/^[0-9a-f]{40}:[^:]+:[a-z-]+:\d+$/.test(e.fingerprint) || !REASONS.includes(e.reason ?? ''));
  expect(bad).toEqual([]);
});

it('runs on every push, after proving each rule fires', () => {
  const start = CI.indexOf('\n  secrets:\n');
  expect(start).toBeGreaterThan(0);
  const rest = CI.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][a-z-]*:\n/);
  const job = next === -1 ? rest : rest.slice(0, next);
  expect(job).toContain('fetch-depth: 0');
  expect(job).toMatch(/sha256sum -c/);
  expect(job).toContain('node mobile/scripts/secrets-planted.cjs');
  expect(job).toMatch(/gitleaks git[^\n]*--log-opts/);
  expect(job).toContain('--gitleaks-ignore-path .gitleaksignore');
});

it('the baseline check says NO — to a fingerprint under no reason, and under one not on the list', () => {
  const fp = `${'a'.repeat(40)}:x.js:password-in-code:4`;
  expect(judged(`# dead: gone\n${fp}\n\n${fp}`).map((e) => e.reason)).toEqual(['dead', null]);
  expect(REASONS.includes(judged(`# probably fine: unsure\n${fp}`)[0].reason ?? '')).toBe(false);
});
