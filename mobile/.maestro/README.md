# End-to-End Tests (Maestro)

These flows drive the **real app** like a person does — tap, type, wait — and
check whole journeys from the screen to the database and back.

They run on every push to `main`, and weekly, in **🎬 Sealed E2E**
(`.github/workflows/e2e.yml`): a world built from nothing on GitHub's runner,
that cannot touch production.

- **The backend** is a local Supabase on the runner, running production's exact
  images, with production's exact shape laid over it from the committed
  snapshot (`supabase/schema/*.sql`, by `e2e/db/bootstrap.mjs`). It is then
  checked with `schema:check`: the copy must produce the same three files as
  production, or the run stops. A copy that differs proves nothing.
- **Sealed:** production's host is pointed at nothing, on the runner and inside
  every container, and firewalled for all container traffic. The bootstrap
  proves it from inside the database: the one outbound call the schema makes
  (the push sender) must fail to connect.
- **Members** are made through the auth API (`e2e/db/seed.mjs`), so production's
  own trigger makes their profiles. Their addresses are on the reserved `.test`
  domain, and their passwords are new on every run and reach the flows as
  `${E2E_MEMBER_EMAIL}` / `${E2E_MEMBER_PASSWORD}`. No flow holds an account.
- **TMDB** is answered from recordings (`e2e/supabase/functions/tmdb-proxy`), so
  the same search finds the same film every time. A request with no recording
  is answered as TMDB answers "nothing", and listed on the run page. Record the
  list with `node e2e/tmdb/record.mjs --from <file>` (in `mobile/`).
- **The app** is a release APK built on the runner (`app.config.js` with `E2E=1`:
  plain http to the runner, no over-the-air updates), on an Android 34 emulator.
- **After the flows,** `e2e/db/verify-writes.mjs` finds, in the database, the row
  each logging flow must have written, with the exact words it typed.

A failed run explains itself on the run page, where anyone can read it: each
flow's result as an error, and for each failed flow a notice naming the step,
why it failed, and what was on the screen at that moment. The flows run one at
a time, each from a clean install, so no flow depends on another.

## The flows

| File | What it proves |
|---|---|
| `boot_verification.yaml` | the app boots, and the whole tab bar is there |
| `login_flow.yaml` | signing in through the Profile tab (through the Initiation, as a new member) lands on your member file |
| `auth_flow.yaml` | forgot-password: the recovery modal, and back to sign-in |
| `auth_deep_link.yaml` | `reelhouse://reset-password` with no session gets the rescue screen |
| `darkroom_search.yaml` | the Darkroom's suggestions open a film page (no account) |
| `flow_critical_path.yaml` | sign in → find → log with a review → the tray offers to edit it; the row is in the database |
| `log_film_flow.yaml` | logging from the full results, not the suggestion row |
| `film_log.yaml` | abandoning a film with a reason |
| `browse_vault.yaml` | a member opens a room from their holdings |
| `social_pulse_flow.yaml` | the Lobby's Pulse renders for a member |
| `lounge_flow.yaml` | the Lounge's two doors: the visitor's gate, and the member's rope at ESTABLISH |
| `offline_resilience.yaml` | a log made offline is queued, and sent on reconnect |
| `error_recovery.yaml` | rapid tab switching never trips the error screen |

`subflows/` holds the steps the flows share: signing in, and opening a film.

## Kept true

`src/utils/__tests__/maestroFlows.guard.test.ts` reads every flow on every push:
each id must be a testID in the app, each text must match (as Maestro matches:
the whole text, as a pattern) something the app writes, each flow must drive
this app, and none may hold an account. A change to the app that strands a flow
fails CI the same day.

## When a flow fails only sometimes

No retries. A retry turns "this fails one run in five" into green, and the
one-in-five is usually a real race a member will also hit. A flow that fails
without a change behind it is a finding: read its screen notice, and either
fix the race in the app or make the flow wait for the true signal (an element,
never a sleep). If it cannot be fixed that day, take it out of the run in its
own commit, with an issue that names it — never by loosening its checks.

## iOS

Not in the sealed world, on purpose. GitHub's macOS runners have no Docker, so
a local backend cannot run beside the iOS simulator, and pointing the flows at
a hosted project would mean a second production-like database to keep in
step. The Android run exercises the same JavaScript, the same backend and the
same flows; what it cannot see is iOS-only native behaviour, which the device
checks in the launch checklist cover.

## Running them yourself

The sealed world needs Docker (for the local Supabase), a JDK 17, the Android
SDK and Maestro. `e2e.yml` is the exact recipe, step by step; on a machine with
those, follow it from "Start the local stack" to "The flows".
