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
  // An RPC entry is either a bare name or { name, signature }. The second shape
  // exists because a name-only contract is what let #24 hide: the function was
  // present under a name the app knew and a signature it could not call, so this
  // guard and the live checker both reported it healthy while every call 404'd.
  const contract = JSON.parse(
    readFileSync(join(ROOT, 'scripts', 'backend-contract.json'), 'utf8'),
  ) as { rpcs: (string | { name: string; signature?: string })[]; edgeFunctions: string[] };
  const contractRpcNames = contract.rpcs.map((r) => (typeof r === 'string' ? r : r.name));
  const found = extractDependencies();

  // If either of these fails, the app's backend dependency surface changed.
  // Before updating scripts/backend-contract.json, confirm every NEW entry
  // EXISTS and is DEPLOYED on the live DB (node scripts/check-backend-live.mjs).
  it('database RPC calls match scripts/backend-contract.json', () => {
    expect(found.rpcs).toEqual([...contractRpcNames].sort());
  });

  it('a declared signature names the RPC it belongs to', () => {
    // A signature pinned to the wrong name would silently check nothing.
    for (const r of contract.rpcs) {
      if (typeof r === 'string' || !r.signature) continue;
      expect(`${r.name}:${r.signature.startsWith(`${r.name}(`)}`).toBe(`${r.name}:true`);
    }
  });

  it('the RPC repaired in batch 26 is signature-checked, not name-checked', () => {
    // Named-only entries remain, and that is a measured gap rather than a
    // silence — the live checker prints the count every run. This one is pinned
    // because it is the case that proved names are not enough.
    const entry = contract.rpcs.find(
      (r) => typeof r !== 'string' && r.name === 'get_priority_reports',
    ) as { signature?: string } | undefined;
    expect(entry?.signature).toBe(
      'get_priority_reports(p_limit integer, p_cursor_count bigint, p_cursor_created timestamp with time zone, p_cursor_id uuid)',
    );
  });

  it('edge-function calls match scripts/backend-contract.json', () => {
    expect(found.edgeFunctions).toEqual([...contract.edgeFunctions].sort());
  });
});
