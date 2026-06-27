/**
 * backendContract.test.ts — repo↔backend drift guard.
 * ────────────────────────────────────────────────────
 * Re-derives every database RPC (`.rpc('name')`) and edge function
 * (`functions/v1/name` or `.functions.invoke('name')`) the app actually calls,
 * and asserts it matches scripts/backend-contract.json.
 *
 * Why: on 2026-06-26 we found the live DB/edge functions had drifted from the
 * repo — the app called functions that didn't exist or were deployed under the
 * wrong slug, silently breaking features. This test makes any change to the
 * app's backend dependency surface VISIBLE: if you add/remove an rpc or edge
 * function, this fails until you update the contract — and that's the moment to
 * confirm the function actually exists and is deployed on the live DB
 * (run: node scripts/check-backend-live.mjs).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.|\.d\.ts$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function extractDependencies(): { rpcs: string[]; edgeFunctions: string[] } {
  const files = [join(ROOT, 'src'), join(ROOT, 'app')].flatMap((d) => walk(d));
  const rpcs = new Set<string>();
  const edges = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    const rpcRe = /\.rpc\(\s*['"]([a-z0-9_]+)['"]/g;
    while ((m = rpcRe.exec(src))) rpcs.add(m[1]);
    const invokeRe = /\.functions\.invoke\(\s*['"]([a-z0-9-]+)['"]/g;
    while ((m = invokeRe.exec(src))) edges.add(m[1]);
    const urlRe = /functions\/v1\/([a-z0-9-]+)/g;
    while ((m = urlRe.exec(src))) edges.add(m[1]);
  }
  return { rpcs: [...rpcs].sort(), edgeFunctions: [...edges].sort() };
}

describe('backend contract (repo↔production drift guard)', () => {
  const contract = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'backend-contract.json'), 'utf8'),
  ) as { rpcs: string[]; edgeFunctions: string[] };
  const found = extractDependencies();

  // If either of these fails, the app's backend dependency surface changed.
  // Before updating scripts/backend-contract.json, confirm every NEW entry
  // EXISTS and is DEPLOYED on the live DB (node scripts/check-backend-live.mjs).
  it('database RPC calls match scripts/backend-contract.json', () => {
    expect(found.rpcs).toEqual([...contract.rpcs].sort());
  });

  it('edge-function calls match scripts/backend-contract.json', () => {
    expect(found.edgeFunctions).toEqual([...contract.edgeFunctions].sort());
  });
});
