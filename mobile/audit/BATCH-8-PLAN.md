# BATCH 8 — #65 · The committed TMDB API key

**Status: STUDIED. Every claim below was executed against the live site, the live
API and the public repo. Nothing written yet.**
Studied 2026-08-01.

---

## 1 · CONFIRMED — and a previous audit pass got this wrong

An earlier pass downgraded this finding:

> *"#65 — partially stale. Current code is clean (`.env.example:14`: 'TMDB API key is
> now server-side only'), `.env` was never committed… The finding as written
> ('shipped in the web bundle') is false today."*

**That reassessment is wrong.** It read `mobile/.env.example` — which is true, mobile
*is* server-side only — and concluded the whole finding was stale. The **web app was
never checked**, and the web is where the key ships.

Executed, not reasoned:

| check | result |
|---|---|
| Is the key in the **live** web bundle? | **YES** — a 32-hex literal in `/assets/index-*.js` |
| Is that key **valid**? | **YES** — `api.themoviedb.org/3/movie/550?api_key=…` → **HTTP 200** |
| Is the GitHub repo **public**? | **YES** — unauthenticated API fetch → **HTTP 200** |
| Is it in git history? | **YES — 6 commits**, not the 4 previously reported |
| Is `.env` committed? | No. But **`.env.vercel.pull` is tracked** and contains it |

So the key is obtainable three independent ways, by anyone, right now: view-source on
the live site, read the public repo's history, or read one tracked file.

**Mechanism:** `src/tmdb.ts:3` and `src/utils/archiveImport.ts:23` read
`import.meta.env.VITE_TMDB_API_KEY`. Vite **inlines** `import.meta.env.*` at build
time — it is not a runtime lookup. Anything prefixed `VITE_` is, by design, public.

---

## 2 · What is NOT exposed — the part that matters most

I searched the entire public history for the catastrophic case:

| secret | result |
|---|---|
| Supabase **service role** key (`sb_secret_…`) | **0 occurrences, ever** |
| Any secret value assigned inline | **none** — every `SUPABASE_SERVICE_ROLE_KEY` hit is `Deno.env.get(...)` in an edge function, reading from the environment |
| `VERCEL_OIDC_TOKEN` in `.env.vercel.pull` | **EXPIRED 2026-04-05** — harmless |
| Supabase anon key / URL | public by design; not a secret |

**The one key that would have been a true emergency was never committed.** The edge
functions read their secrets from the environment correctly, in every commit.

⚠️ **A harness correction worth recording.** My first history scan looked for JWTs
(`eyJ…`) and reported "no service_role key". I then tested the decoder against the
known anon key and it *failed* — because Supabase now issues `sb_publishable_…`
keys, which are **not JWTs**. The scan had been searching for the wrong shape and
would have reported "clean" regardless of what was there. Re-run with the correct
patterns (`sb_secret_`, inline assignment), the result genuinely is clean.

---

## 2b · The full secret sweep — every service, tracked files AND history

Because the repo is public, one leaked key is a reason to check them all. Every
integration this app uses, searched in tracked files and in every commit:

| service | result |
|---|---|
| Supabase **service role** | **0, ever** — all hits are `Deno.env.get()` in edge functions |
| **PayTabs** (payments) | 22 hits, **all in audit markdown discussing the function**. No credential. |
| **RevenueCat** | `appl_…` in `mobile/eas.json` — the **public SDK key**, designed to ship. Secret keys start `sk_`; none present. |
| **Expo / EAS** | `${{ secrets.EXPO_TOKEN }}` — a GitHub Actions reference, not a value |
| PostHog · Resend · Stripe | 0 |
| Private key blocks (`BEGIN … PRIVATE KEY`) | **0 tracked, 0 in history** |
| `VERCEL_OIDC_TOKEN` | expired 2026-04-05 |
| **TMDB v3 key** | 🔴 **leaked — bundle, 6 commits, and a tracked file** |

Then the same class of mistake, checked exhaustively: **every** `VITE_*` and
`EXPO_PUBLIC_*` variable, since those are public by definition.

`VITE_SUPABASE_*`, `EXPO_PUBLIC_SUPABASE_*`, `EXPO_PUBLIC_SENTRY_DSN`,
`EXPO_PUBLIC_REVENUECAT_*`, `VITE_POSTHOG_*`, `VITE_VAPID_PUBLIC_KEY` — all
genuinely public by design. `EXPO_PUBLIC_TMDB_API_KEY` survives only in
documentation and one comment; **no live mobile code reads it.**

### One latent trap found — not leaked, but one import away

`VITE_TMDB_READ_URL` is, despite the name, a **TMDB v4 Bearer token**
(`api/og.js:23`: `const token = process.env.VITE_TMDB_READ_URL`).

It is **not leaked today** — verified: no `eyJ…` Bearer token in the live bundle, and
it is not in `.env.vercel.pull`. It is read as `process.env` inside a Vercel
serverless function, which is server-side, and Vite only inlines `VITE_*` variables
that client code actually references.

But it carries a `VITE_` prefix, which is the project's own marker for *"safe to ship
to the browser"*. The day anyone writes `import.meta.env.VITE_TMDB_READ_URL` in a
component, it is inlined into the bundle — silently, with no error — exactly as the
v3 key was.

**Fix: rename it to `TMDB_READ_TOKEN`** (no prefix). Server-side code reading
`process.env` is unaffected; the name then makes the mistake impossible instead of
merely unlikely. Cheap, and it removes a whole class of future leak.

---

## 3 · Real severity, stated honestly

This is **not** a data breach. A TMDB v3 key grants read-only access to TMDB's public
film catalogue. It cannot touch ReelHouse data, members, or Supabase.

What it actually costs:

- **Rate limits are per key.** Anyone abusing it consumes *your* quota; film search
  and posters degrade or fail for real members.
- **TMDB's terms** make the account holder responsible for the key. Sustained abuse
  risks the key — or the account — being suspended.
- **It is free to fix and free to prevent**, which is what makes leaving it
  indefensible rather than merely untidy.

Rated **High for hygiene, not for confidentiality.** #65's own wording — "shipped in
the web bundle" — is exactly right; only the earlier downgrade was wrong.

---

## 4 · The fix — and mobile already built it

`tmdb-proxy` exists, is deployed (live probe: HTTP 400 = present), and mobile uses
it exclusively. `mobile/src/lib/tmdb.ts:9` even documents why:

> *"the TMDB API key is NOT read on the client — it lives only in the tmdb-proxy edge
> function's server-side secret, so it can never be extracted from the JS bundle."*

The right fix is not to invent anything. It is to make the web do what mobile already
does.

**Contract, read from the deployed function:**
```
POST {SUPABASE_URL}/functions/v1/tmdb-proxy
headers: Content-Type: application/json · apikey: <anon> · Authorization: Bearer <anon>
body:    { "path": "/movie/550?append_to_response=credits" }
```

It also carries an allow-list and per-path caching the direct calls do not have.

**The allow-list already covers every path the web requests** — verified by
extracting both sides:

| web requests | on the allow-list |
|---|---|
| `/search/movie` | ✅ |
| `/discover/movie` | ✅ |
| `/trending/movie` | ✅ |
| `/person/` | ✅ |

**So the proxy needs no changes at all.** Two web files change; nothing else.

| file | change |
|---|---|
| `src/tmdb.ts:25` | route through the proxy instead of `api_key=` |
| `src/utils/archiveImport.ts:140` | same |
| `src/vite-env.d.ts:6` | drop the `VITE_TMDB_API_KEY` declaration |
| `.env.vercel.pull` | untrack and gitignore |

Mobile changes **nothing** — it is already correct.

---

## 5 · Order matters, and rotation is the only step that actually closes it

Removing the key from the code closes nothing while the old key still works. Equally,
rotating first breaks the live site until the new bundle deploys.

1. **Web → proxy.** Change the two call sites, deploy, and **verify the new bundle
   contains no 32-hex literal** before going further.
2. **Untrack `.env.vercel.pull`**, add it to `.gitignore`.
3. **Rotate at TMDB** and put the new key in the Supabase secret
   (`supabase secrets set TMDB_API_KEY=…`), close together.
4. **Verify** the live site still loads films, and that the *old* key now returns
   401 from TMDB.

⚠️ **One thing I cannot determine from here:** whether TMDB invalidates the old key
the instant a new one is issued, or allows an overlap. If there is no overlap there
is a brief window — seconds to a minute — where TMDB calls fail for everyone. That is
the only user-visible risk in this batch, it is short, and it affects film metadata
only. Stated rather than guessed.

## 6 · Git history — deliberately NOT rewritten

The key sits in 6 public commits. Rewriting history (`filter-repo`, force-push) would
break every clone and every existing PR reference, and is **pointless once the key is
dead** — a revoked key in an old commit is a dead string.

**Rotation is the closure. History rewriting is theatre.** The only reason to rewrite
would be a still-valid secret that cannot be rotated, which is not this case.

**DONE WHEN** the live web bundle contains no key literal, the old key returns 401
from TMDB, `.env.vercel.pull` is untracked, and both apps still fetch film data.
