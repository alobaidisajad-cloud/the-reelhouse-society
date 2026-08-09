/**
 * certifyCountAuthority.test.ts — batch 23 · #39
 * ───────────────────────────────────────────────
 * One number, computed three ways, all three filtered by who was looking.
 *
 * The filed fix said "use certify_count — one path is already
 * server-authoritative." Verified against the live catalog: `prosecdef = false`
 * on all three stack feed functions, so none of them was. Adopting it would have
 * made two numbers agree on a wrong value while looking like a repair.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const stackSvc = strip(read('src/services/StackService.ts'));
const feedSvc = strip(read('src/services/FeedService.ts'));
const migration = read('supabase/migrations/20260809_01_authoritative_certify_counts.sql');

describe('#39 · the endorsement count does not depend on who is looking', () => {
  it('no service counts endorse_list rows through the viewer\'s own RLS', () => {
    // Both shapes: a PostgREST exact-count, and fetching the rows to tally them.
    for (const [name, src] of [['StackService', stackSvc], ['FeedService', feedSvc]] as const) {
      expect(`${name}:${/from\('interactions'\)[\s\S]{0,200}?endorse_list/.test(src)}`)
        .toBe(`${name}:false`);
    }
  });

  it('both call sites use the authoritative functions', () => {
    expect(stackSvc).toMatch(/supabase\.rpc\('list_certify_count',\s*\{\s*p_list_id/);
    expect(feedSvc).toMatch(/supabase\.rpc\('list_certify_counts',\s*\{\s*p_list_ids/);
  });

  it('and those functions are SECURITY DEFINER — the whole point', () => {
    // Without this they inherit the caller's RLS and nothing has changed. The
    // deployed feed RPCs are INVOKER, which is exactly how the defect survived.
    //
    // Matched on the HEADER, between the signature and the body. The first
    // version of this test read 400 characters from the function name and was
    // satisfied by the phrase "SECURITY DEFINER" inside the COMMENT ON below it
    // — so stripping the real modifier left it green. Mutation testing found
    // that; reading the test did not.
    const noComments = strip(migration);
    for (const sig of ['list_certify_count(p_list_id', 'list_certify_counts(p_list_ids']) {
      const from = noComments.indexOf(`FUNCTION public.${sig}`);
      expect(from).toBeGreaterThan(-1);
      const header = noComments.slice(from, noComments.indexOf('AS $function$', from));
      expect(`${sig}:${/SECURITY DEFINER/.test(header)}`).toBe(`${sig}:true`);
      expect(`${sig}:${/SET search_path = public/.test(header)}`).toBe(`${sig}:true`);
    }
    // A DEFINER function without a pinned search_path is the trap this codebase
    // already had 24 of.
    expect((migration.match(/SET search_path = public/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('the rewritten feed RPC keeps its block filter and username search', () => {
    // I rebuilt this body from memory once and it silently lost `is_hidden_by`
    // and the username branch — blocked members' stacks would have returned to
    // the feed. It must differ from the previous migration on the count alone.
    const body = migration.slice(migration.indexOf('FUNCTION public.get_filtered_stacks_auth_cursor_v2'));
    expect(body).toMatch(/is_hidden_by\(auth\.uid\(\), l\.user_id\)/);
    expect(body).toMatch(/p\.username ILIKE/);
    expect(body).toMatch(/COALESCE\(p_search, ''\) = ''/);
    expect(body).toMatch(/LIMIT LEAST\(GREATEST\(p_poster_count, 0\), 10\)/);
    expect(body).toMatch(/public\.list_certify_count\(l\.id\) AS certify_count/);
  });

  it('every result of the stack payload has its error checked', () => {
    // Two were ignored, not the one the register named — the film-count check
    // was added in batch 20, after it was written. Its fallback reported the
    // CAPPED fetch length, the dishonest count batch 20 set out to remove.
    // The GUARD, not a mention. Asserting `endorseRes.error` appeared anywhere
    // was satisfied by the argument to captureError inside the branch, so
    // disabling the branch left the test green.
    for (const res of ['listRes', 'itemsRes', 'filmCountRes', 'endorseRes']) {
      expect(`${res}:${new RegExp(`if \\(${res}\\.error\\)`).test(stackSvc)}`).toBe(`${res}:true`);
    }
  });

  it('the new RPCs are declared in the backend contract', () => {
    const manifest = read('scripts/backend-contract.json');
    expect(manifest).toContain('"list_certify_count"');
    expect(manifest).toContain('"list_certify_counts"');
  });
});
