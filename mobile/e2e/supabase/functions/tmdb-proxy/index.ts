/**
 * tmdb-proxy — the E2E stand-in. NEVER DEPLOY THIS.
 *
 * In the sealed E2E world the app still calls `${SUPABASE_URL}/functions/v1/tmdb-proxy`,
 * exactly as in production, but this answers instead of TMDB: from answers
 * recorded once from the real proxy (fixtures/, written by e2e/tmdb/record.mjs).
 * So a run does not depend on TMDB being up, on a key, or on today's trending
 * list — the same search finds the same film every time.
 *
 * A request with no recording is answered the way TMDB answers "nothing": an
 * empty list, or a 404 for a single film or person. It is also printed as
 * `E2E-TMDB-MISS <path>`, and the workflow lists every miss on the run's
 * summary, so a gap is seen and recorded rather than guessed at.
 *
 * It refuses to answer anywhere but a local stack, so a deploy by mistake
 * from this folder breaks loudly instead of quietly replacing the real proxy.
 */
import { fixtureName, normalizeTmdbPath } from './normalize.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// The local stack runs functions behind http://kong:8000; production is https://<ref>.supabase.co.
const LOCAL = /^http:\/\/(kong|127\.0\.0\.1|localhost|host\.docker\.internal)(:\d+)?$/.test(Deno.env.get('SUPABASE_URL') ?? '');

const index: Record<string, string> = JSON.parse(
  await Deno.readTextFile(new URL('./fixtures/index.json', import.meta.url)),
);

/** TMDB with nothing to say: a list answers empty, a single thing 404. */
const nothing = (path: string) =>
  /^\/(movie|person)\/\d+(\?|$)/.test(path)
    ? json({ success: false, status_code: 34, status_message: 'The resource you requested could not be found.' }, 404)
    : json({ page: 1, results: [], total_pages: 0, total_results: 0 }, 200);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!LOCAL) return json({ error: 'The E2E stand-in for tmdb-proxy must never run outside a local stack.' }, 500);

  let callerPath = '';
  try {
    const body = await req.json();
    callerPath = typeof body?.path === 'string' ? body.path : '';
  } catch {
    // An empty or non-JSON body is a bad request, as in production.
  }
  const path = normalizeTmdbPath(callerPath);
  if (!path) return json({ error: 'Path not allowed' }, 403);

  const file = index[path];
  if (!file) {
    console.log(`E2E-TMDB-MISS ${path}`);
    return nothing(path);
  }
  console.log(`E2E-TMDB-HIT ${path}`);
  const recorded = JSON.parse(await Deno.readTextFile(new URL(`./fixtures/${file}`, import.meta.url)));
  return json(recorded.body, recorded.status);
});

// One fixtureName for the stand-in and the recorder alike.
export { fixtureName };
