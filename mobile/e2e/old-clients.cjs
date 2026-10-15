/**
 * Reading mobile/e2e/old-clients.json: which shipped clients are checked, and
 * whether a client's record is whole. Shared by db/old-clients.mjs (each client
 * held to the proposed schema) and old-client-tree.mjs (each client run end to
 * end), and held by migrationSafety.guard.test.ts.
 */

/** What an E2E run of a shipped client keeps from this checkout. */
const HARNESS = ['e2e', 'scripts', 'supabase', 'node_modules'];

const FULL = /^[0-9a-f]{40}$/;
const APP_PATH = /^mobile\/(?!e2e\/|scripts\/|supabase\/)[\w./[\]-]+$/;

/** The named client: checked, a full commit, each patch an app file, a commit and a reason. */
const clientNamed = (record, name) => {
  const c = record.clients.find((x) => x.name === name);
  if (!c) return { refuse: `no client named "${name}" in old-clients.json` };
  if (!c.checked || !FULL.test(c.commit ?? '')) return { refuse: `${name} is not a checked client with a full commit` };
  for (const p of c.patches ?? []) {
    if (!APP_PATH.test(p.path ?? '') || !FULL.test(p.from ?? '') || !(p.why ?? '').trim()) {
      return { refuse: `${name}: a patch needs an app path outside the harness, a full commit and a reason (${p.path})` };
    }
  }
  return { client: c };
};

/** Every checked client, each whole, or an error naming the first that is not. */
const toCheck = (record) => record.clients.filter((c) => c.checked).map((c) => {
  const { client, refuse } = clientNamed(record, c.name);
  if (refuse) throw new Error(refuse);
  return client;
});

module.exports = { HARNESS, clientNamed, toCheck };
