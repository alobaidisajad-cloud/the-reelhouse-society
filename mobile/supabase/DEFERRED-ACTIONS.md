# Deferred actions — things deliberately not applied yet

Work that is **written, correct, and intentionally waiting** for a condition.
Not a backlog: everything here is finished SQL whose only remaining question is
*when*.

This file exists because the alternative was a comment inside one of 143
migration files. Batch 32 found the entry below by extracting every function all
43 "APPLY MANUALLY" migrations claim to create and diffing against the live
database — it was one of only two absences in the whole repo. A deferral nobody
can find is indistinguishable from a mistake.

`npm run schema:check` reconciles what IS. This file records what is **meant to
change later**, which no snapshot can infer.

---

## DA-1. A narrowing of one column's read, held for the old build

**Blocked on** the launch build replacing the TestFlight build on every phone that has it (and any old client the
audit records). Its text, its probe and its steps are kept privately until it is closed and probed.

---

## 2. `supabase_admin` default privileges

**Found in** batch 29
**Blocked on** nothing we control

`supabase_admin` carries default privileges granting TRUNCATE, REFERENCES,
TRIGGER and MAINTAIN on future tables to `anon` and `authenticated`. We revoked
these for `postgres`, which owns all 27 tables and creates every new one, so the
practical exposure is closed.

`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` fails with *"permission denied
to change default privileges"*, and `postgres` is not a member of that role. It
applies only to tables created **by Supabase's own tooling** in `public`, which
this project does not do.

The `noWipePrivileges` assertion in `scripts/check-backend-live.mjs` catches it
if such a table ever appears.

---

## 3. Drop `public.lounges.invite_code`

**Found in** the Lounge polish pass, 2026-08-14
**Blocked on** a mobile build shipping

Invite codes are retired. A private salon is entered by requesting admission and
being admitted by the host; the code was a second, weaker door that bypassed that
approval, and `secure_invite_codes` — the server-side validation that would have
made it safe — was scoped as Phase 5.3 and never built.

Mobile stopped issuing codes with the Editorial Salon overhaul but kept SELECTing
the column; web was still minting, displaying and redeeming them. Both are now
clean, and the values themselves are nulled.

**The column cannot be dropped yet.** The currently shipped TestFlight build
still lists `invite_code` in its `lounges` select. Dropping it makes PostgREST
answer `column lounges.invite_code does not exist` — a 400 that fails the whole
query, so the salon list would break for every tester on that build.

Run this once a build without the column in its select has replaced it:

```sql
ALTER TABLE public.lounges DROP COLUMN invite_code;
```

Until then the column sits NULL and unread, which costs nothing and keeps the old
build working.

**Why it mattered:** until the `lounges` SELECT policy was scoped from `{public}`
to `{authenticated}`, every code was readable by anyone holding the app's public
anon key — and web's `joinByInviteCode` would redeem one straight into a private
room. Probed live: two private salons' codes came back to an unauthenticated
caller.

---

## DA-4. A Realtime setting switched off

**Blocked on** the launch build having shipped. Its text is kept privately until it is done and probed.

---

## DA-5. The admin second factor required

**Blocked on** the launch build (which offers the second factor) replacing the TestFlight build. Its text is kept
privately until it is done and probed.

---

## DA-6. Updates unpaused

The update channels a build on a phone follows (`production`, `preview`, `e2e`) are paused on Expo's server, so a
publish from any machine reaches no phone.
**Blocked on** a build whose runtime is tied to its native code having shipped, and the user's answer to keeping
updates on. If the answer is no, they stay paused.

---

## DA-7. The legacy-handle grace in `enforce_username_policy`

**File** `mobile/supabase/migrations/20260802_01_username_charset_backstop.sql`, the block marked TEMPORARY
**Blocked on** the launch build replacing the TestFlight build.

The policy treats a new handle that is exactly the cleaned form of the stored one as no change, because the
TestFlight build sends the cleaned form on every profile save: a bio edit would otherwise rename a member whose
handle predates the charset rules. Once that build is gone the block is removed, with a sealed test that a legacy
member can then rename to the cleaned form of their handle.

---

## A web page for one filing — `/dispatch/:id`

**Where:** the web app, `src/App.tsx` and a new page beside `DispatchPage.tsx`.
**Not the mobile app.** Nothing here is blocked on it.

**What is missing.** The web app routes `/dispatch` and `/dispatch/compose` and
nothing else: a dossier is opened in a MODAL over the index, so no filing has a
web address. The web's own share button reflects that — it sends
`${origin}/dispatch`, the department, never the essay.

**Why it came up.** Sharing an essay out of the mobile app should let a stranger
read it. The mobile share now sends a clipping — an image carrying the masthead,
the title, the opening and the byline — plus a link. That link was
`reelhouse://dispatch/<id>`, which opens nothing for anybody without the app, and
then `https://reelhouse.app/dispatch`, which is ANOTHER COMPANY'S domain (a
household film-picker also called Reelhouse; its /dispatch is a 404). It is now
`https://www.thereelhousesociety.com/dispatch` (HOUSE_WEB in
src/constants/support.ts), the house's own web app, which routes it.

So the share works and is honest. What it cannot yet do is take somebody to the
essay itself.

**What it needs, in order:**

1. A web route `/dispatch/:id` reading one row from `dispatch_posts` — the same
   table the mobile reader uses, so no new backend.
2. `DispatchPage`'s share sending that URL instead of the index.
3. `associatedDomains` (iOS) and `intentFilters` (Android) in `mobile/app.json`
   for `www.thereelhousesociety.com`, so the link opens the APP for members who have it and the
   page for everyone else. Requires an `apple-app-site-association` file and an
   `assetlinks.json` served from the domain.
4. Then, and only then, point the mobile share at `/dispatch/<id>`. The test
   `readerScreen.test.tsx › sends a WEB link` asserts the current behaviour and
   will need its expectation moved in the same change.

**Until then** the mobile share is correct as it stands: the image carries the
writing, the link carries the house.

---

## SAVE THE CARD — a row that needs a native dependency

**Found 2026-09-04**, coverage-mapping the reader's dark statements.

`ShareSheet` takes a `card` prop that adds a SAVE THE CARD row, described as
"A picture, to your photos". The reader is the only screen that mounts the
sheet and never sets it, so the row has never appeared.

**Two reasons, and the second decides it:**

1. A direct save means writing to the photo library, which needs
   `expo-media-library`. It is not a dependency of this app, and adding one
   needs a native build — which the release is frozen against.
2. Without a direct save the row would DUPLICATE `ELSEWHERE`, which already
   captures a dossier's clipping and hands it to the system sheet where "Save
   Image" is one tap. Two rows doing one thing is worse than one, and a row
   promising the photo library while opening a share sheet is worse still.

**If it is wanted, in order:**

1. `expo-media-library` as a dependency, and a new native build.
2. `MediaLibrary.requestPermissionsAsync()` before the first save, with the
   refusal handled — a member who says no must get a sentence, not a silent
   failure.
3. `card={live.kind === 'dossier'}` on the `ShareSheet` in `app/dispatch/[id].tsx`.
4. A `SAVE THE CARD` branch in `onDest` that calls `MediaLibrary.saveToLibraryAsync`
   on the captured file, rather than falling through to `shareElsewhere`.
5. The test `readerScreen.test.tsx › offers no SAVE THE CARD row` pins the
   current behaviour and will need its expectation moved in the same change.

**Until then** the prop stays unset with the reason written at its declaration,
so the next sweep finds a decision rather than re-finding a gap.
