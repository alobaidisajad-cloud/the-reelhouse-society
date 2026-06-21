/**
 * invariants.ts — Boot-Time Environment Invariant Assertions
 * ────────────────────────────────────────────────────────────
 * Validates that all required environment variables are set
 * BEFORE any SDK initialization occurs. If any are missing, the app
 * crashes immediately with a clear, actionable error message instead
 * of failing 30 seconds later with a cryptic "Invalid URL" error.
 *
 * Import this module at the very top of _layout.tsx — before any
 * other imports that depend on Supabase, TMDB, or Sentry.
 *
 * This runs ONCE at module load time. Zero runtime cost after boot.
 */

const missing: string[] = [];

if (!process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL.trim() === '') {
  missing.push('EXPO_PUBLIC_SUPABASE_URL');
}

if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim() === '') {
  missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

if (missing.length > 0 && !process.env.JEST_WORKER_ID) {
  // In production/dev builds, crash hard with a clear message.
  // In test environments (Jest), skip — tests set mock env vars in jest.setup.ts.
  const message = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '  [FATAL] Missing required environment variables:',
    ...missing.map((key) => `    ✗ ${key}`),
    '',
    '  Create a .env file in the project root with:',
    ...missing.map((key) => `    ${key}=<your-value>`),
    '',
    '  See .env.example for reference.',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');

  throw new Error(message);
}

// Nominal export so TypeScript doesn't treat this as a script
export const ENV_VALIDATED = true;
