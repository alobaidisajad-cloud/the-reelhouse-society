# The message to send TMDB

**Where:** the **support forums** link on your own API settings page
(themoviedb.org → Settings → API → "support forums"), or TMDB's contact form.

**Copy everything below the line and send it.** Nothing to fill in except the two
keys, which are already written in.

---

**Subject:** Request to revoke a previously exposed API key

Hello,

I need an old v3 API key on my account permanently revoked. It was accidentally
published in a public GitHub repository and in a client-side JavaScript bundle, so
it must be assumed compromised.

**Key to revoke:** `d1e75fde43599fbf24103e2fa5072996`

I have already regenerated my key and moved all API access server-side, so nothing
of mine depends on the old key any more. However, regenerating does not appear to
invalidate previously issued keys — the old key still returns 200 from
`/3/movie/550`, alongside my current one.

**Current key I wish to keep active:** `55c9f4be8a51a3a7cf77f5ac625cf2a2`

Please revoke the exposed key and confirm once done. If any other keys were issued
on my account during my attempts to rotate, please revoke those as well and leave
only the current one active.

Account username: **sajjadsaleel**

Thank you.

---

## After they confirm

Tell me, and I will verify the old key returns 401 and that your app and website
still work on the current one.

## Why this is the only remaining step

The exposure itself is already closed:

- the key is no longer in the web bundle (verified against the live site and all 45
  page files)
- it is no longer in any tracked file (`.env.vercel.pull` untracked and gitignored)
- both apps now fetch through the `tmdb-proxy` edge function, whose key is a
  server-side secret
- the `VITE_`-prefixed variable name — the thing that made the leak possible — no
  longer exists anywhere

What cannot be fixed from this side is the copy of the old key sitting in seven
public commits. Rewriting git history would not help: the key would still be in
every existing clone. **Revocation by TMDB is the only thing that actually kills
it**, which is what this message asks for.
