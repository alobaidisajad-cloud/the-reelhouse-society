import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * sync-films — reads the films nobody has read yet, and fills them in.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * TasteDNA and CinematicInsights need genres, cast and directors. None of it is
 * in our database, so the phone was fetching it one film at a time and giving
 * up at sixty:
 *
 *     const idsToFetch = filmIds.slice(0, 60);   // limit for mobile perf
 *
 * A member with five thousand films got a section titled REAL ANALYTICS drawn
 * from sixty of them. This is the other half of the fix: the `films` table
 * holds the answers, and this fills it.
 *
 * ── IT DRAINS, IT DOES NOT TAKE ORDERS ──────────────────────────────────────
 * Nothing tells this function WHICH film to read. It asks the database for
 * whatever is outstanding and works through a batch. That one decision is what
 * makes the whole design self-healing: a ping lost to a dropped connection
 * costs nothing, because the next invocation — from anybody, for any reason —
 * picks up what the last one missed. There is no queue to get out of sync with,
 * and no film that can be forgotten because one request failed.
 *
 * ── CLAIMS, NOT LOCKS HELD ACROSS A NETWORK CALL ────────────────────────────
 * `claim_films_to_sync` marks a batch and returns instantly; the TMDB calls
 * happen with no transaction open. Holding a row lock across a network round
 * trip is how a slow third party turns into a database problem. A claim that
 * is never completed simply ages out after ten minutes and is offered again.
 *
 * ── AUTH ────────────────────────────────────────────────────────────────────
 * Deployed WITH JWT verification (the default — do NOT pass --no-verify-jwt).
 * It does no user-specific work and writes nothing a member controls, but there
 * is no reason to let the open internet spend our TMDB quota.
 */

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * How many films one invocation reads.
 *
 * Small on purpose. An edge worker has a wall-clock budget, and a batch that
 * runs long is a batch that gets killed halfway — leaving claims to age out and
 * the same films read twice. Twenty finishes in a couple of seconds, and
 * because every invocation drains, "little and often" converges just as fast as
 * "lots and rarely" without ever risking a timeout.
 */
const BATCH = 20

/**
 * TMDB allows roughly 50 requests a second. Five at a time at ~200ms each is
 * about 25/s — half the ceiling, which leaves room for the proxy and the app
 * to be using the same quota at the same moment.
 */
const CONCURRENCY = 5

/** Top billing only. Past ten you are into one-scene parts, which would drown
 *  the signal in "who do I watch most" rather than sharpen it. */
const CAST_DEPTH = 10

interface TmdbPerson {
  id?: number
  name?: string
  profile_path?: string | null
  order?: number
  job?: string
}

interface TmdbFilm {
  title?: string
  release_date?: string
  runtime?: number
  poster_path?: string | null
  genres?: { id: number; name: string }[]
  production_countries?: { iso_3166_1: string }[]
  credits?: { cast?: TmdbPerson[]; crew?: TmdbPerson[] }
}

/**
 * ── FITTING THE CEILINGS ────────────────────────────────────────────────────
 * The films table caps every text column. The caps are generous enough that
 * real data never approaches them — but "never" does a lot of work across a
 * catalogue of a million rows, and the failure it guards against is nasty:
 *
 *   A CHECK violation is a 23514, not a 404. It is not a strike, so
 *   mark_film_sync_failed is never called. The batch fails, the claim ages out
 *   after ten minutes, the same film is claimed again and fails again. For
 *   ever. One malformed record would quietly become the only work the sync
 *   ever does.
 *
 * So the writer fits the data to the ceilings, and the ceilings become a
 * backstop the normal path cannot reach — the only kind worth having.
 */
function cut(s: string | null | undefined, n: number): string | null {
  const t = s?.trim()
  return t ? t.slice(0, n) : null
}

/** Trim a list until it fits BOTH its item count and its joined length. The
 *  join matches Postgres's `array_to_string(col, ',')` exactly. */
function fit(xs: string[], maxItems: number, maxJoined: number): string[] {
  const out = xs.slice(0, maxItems)
  while (out.length > 0 && out.join(',').length > maxJoined) out.pop()
  return out
}

/** What we keep. Everything else TMDB sends is thrown away here, not stored. */
function shape(id: number, m: TmdbFilm) {
  const year = /^(\d{4})/.exec(m.release_date ?? '')?.[1]
  const director = (m.credits?.crew ?? []).find((c) => c.job === 'Director' && c.id && c.name)

  const billed = (m.credits?.cast ?? [])
    // TMDB usually returns cast in billing order, but `order` is the field that
    // actually MEANS it — sorting by it rather than trusting array position.
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    // Filter BEFORE slicing, so a credit missing an id or a name does not
    // consume one of the ten places and leave us with nine.
    .filter((c) => typeof c.id === 'number' && !!c.name?.trim())
    .slice(0, CAST_DEPTH)

  /**
   * Fit the cast by shrinking its DEPTH, never one array on its own.
   *
   * The three arrays are walked together by `unnest(a, b, c)`, which pads the
   * short one with NULL and raises nothing (verified on PG18). Trimming
   * cast_names alone to fit its ceiling would therefore not fail — it would
   * quietly cost us the actors it truncated. Dropping the last-billed player
   * from all three keeps them the same length and the same people.
   */
  let depth = billed.length
  const joinedAt = (n: number, pick: (c: TmdbPerson) => string) =>
    billed.slice(0, n).map(pick).join(',').length
  while (
    depth > 0 &&
    (joinedAt(depth, (c) => (c.name as string).trim()) > 1000 ||
      joinedAt(depth, (c) => c.profile_path ?? '') > 1000)
  ) {
    depth--
  }
  const cast = billed.slice(0, depth)

  return {
    id,
    title: cut(m.title, 300),
    // A year outside this range is data we do not believe. Cinema starts in the
    // 1870s; anything past next decade is a typo or a placeholder.
    year: year && Number(year) >= 1870 && Number(year) <= 2100 ? Number(year) : null,
    runtime: typeof m.runtime === 'number' && m.runtime > 0 && m.runtime < 3000 ? m.runtime : null,
    poster_path: cut(m.poster_path, 200),
    genres: fit((m.genres ?? []).map((g) => g.name).filter(Boolean), 12, 300),

    // THREE ARRAYS, ONE SOURCE. The aggregation walks them together with
    // `unnest(a, b, c)`, so they must be the same length and in the same order.
    // Building all three from this one filtered list is what guarantees that —
    // mapping them from `credits.cast` separately would let one filter step
    // drift and silently pair an actor with somebody else's face.
    cast_ids: cast.map((c) => c.id as number),
    cast_names: cast.map((c) => (c.name as string).trim()),
    // Empty string, not null: a null inside a text[] is fine in Postgres, but
    // keeping the three arrays free of holes makes the unnest easier to reason
    // about, and the client already treats '' as "no picture".
    cast_profiles: cast.map((c) => c.profile_path ?? ''),

    director_id: director?.id ?? null,
    director: cut(director?.name, 200),
    director_profile: cut(director?.profile_path, 200),

    country_codes: fit(
      (m.production_countries ?? []).map((c) => c.iso_3166_1).filter(Boolean),
      12,
      200,
    ),
    synced_at: new Date().toISOString(),
    sync_claimed_at: null,
    sync_failed: 0,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (!TMDB_API_KEY || !SERVICE_ROLE || !SUPABASE_URL) {
    // Say WHICH secret, not "misconfigured" — the whole point of an error is to
    // shorten the distance between seeing it and fixing it.
    return json({ error: 'missing secret', need: { TMDB_API_KEY: !!TMDB_API_KEY, SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_ROLE } }, 500)
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

  try {
    const { data: claimed, error: claimError } = await db.rpc('claim_films_to_sync', { p_limit: BATCH })
    if (claimError) return json({ error: 'claim failed', detail: claimError.message }, 500)

    const ids: number[] = (claimed ?? []).map((r: { id: number }) => r.id)
    if (ids.length === 0) {
      // Not an error, and worth saying plainly: a caller that gets this knows
      // the archive is fully read rather than that something went wrong.
      const { count } = await db.from('films').select('id', { count: 'exact', head: true })
        .is('synced_at', null).lt('sync_failed', 3)
      return json({ synced: 0, failed: 0, remaining: count ?? 0, done: true })
    }

    let synced = 0
    let failed = 0

    /** Read one film. Never throws — a single bad film must not end the batch. */
    const readOne = async (id: number) => {
      try {
        const res = await fetch(
          `${TMDB_BASE}/movie/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits`,
        )

        if (res.status === 429) {
          // Rate limited: release the claim WITHOUT counting a strike. This is
          // our fault for asking too fast, not the film's fault for not
          // existing — charging it a strike would eventually retire a perfectly
          // good film after three busy afternoons.
          await db.from('films').update({ sync_claimed_at: null }).eq('id', id)
          return
        }

        if (res.status === 404 || res.status === 401 || res.status === 403) {
          // TMDB has no answer for this id and never will. Count the strike;
          // three of them and it is retired from the worklist for good.
          await db.rpc('mark_film_sync_failed', { p_film_id: id })
          failed++
          return
        }

        if (!res.ok) {
          await db.from('films').update({ sync_claimed_at: null }).eq('id', id)
          return
        }

        const movie = (await res.json()) as TmdbFilm
        const { error } = await db.from('films').update(shape(id, movie)).eq('id', id)
        if (error) {
          await db.from('films').update({ sync_claimed_at: null }).eq('id', id)
          return
        }
        synced++
      } catch {
        // Network blip, malformed JSON, anything. Release the claim and let it
        // come round again rather than charging a strike for our own trouble.
        try { await db.from('films').update({ sync_claimed_at: null }).eq('id', id) } catch { /* nothing left to do */ }
      }
    }

    // Fixed-size worker pool. `Promise.all` over all twenty would fire twenty
    // simultaneous requests at TMDB, which is exactly the burst the rate limit
    // exists to stop.
    const queue = [...ids]
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const next = queue.shift()
          if (next === undefined) return
          await readOne(next)
        }
      }),
    )

    const { count } = await db.from('films').select('id', { count: 'exact', head: true })
      .is('synced_at', null).lt('sync_failed', 3)

    return json({ synced, failed, remaining: count ?? 0, done: (count ?? 0) === 0 })
  } catch (e) {
    return json({ error: 'sync crashed', detail: e instanceof Error ? e.message : String(e) }, 500)
  }
})
