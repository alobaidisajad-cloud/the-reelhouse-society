# End-to-End Tests (Maestro)

These are the app's **end-to-end tests** — they drive the *real* app like a user
(tap, type, navigate) and verify whole flows from screen → backend → screen.
They're the strongest proof the app actually works. Run them during QA before a
release. **Free** — no paid services required.

> Coverage: 13 flows — login, log-a-film (+ persistence), browse vault, search,
> social pulse, lounge, offline resilience, deep links, boot, error recovery.
> Every `testID` these flows use has been verified to exist in the current app.

---

## One-time setup

1. **Install Maestro** (free, open-source) — follow the official guide for your OS:
   https://maestro.mobile.dev/getting-started/installing-maestro
   - macOS / Linux: `curl -Ls "https://get.maestro.mobile.dev" | bash`
   - **Windows:** install inside **WSL2** (Maestro runs on Linux/macOS); the
     emulator/device on Windows is still reachable from WSL.

2. **Have a device to run on** (either one):
   - an **Android emulator** (Android Studio → Device Manager → create + start one), or
   - a **physical phone** plugged in with USB debugging on.

3. **Install the app onto that device** — the normal dev build:
   ```bash
   cd mobile
   npx expo run:android        # or: run:ios (macOS only)
   ```
   (App id: `com.reelhouse.society`.)

4. **Make sure the test account exists.** The flows sign in as
   **`test@reelhouse.app` / `password123`**. Create that user once (sign up in the
   app, or seed it) or the login-based flows will fail at the sign-in step.

---

## Running the tests

From the `mobile/` folder, with the app installed and the emulator/phone running:

```bash
# Run the whole suite
npm run test:e2e

# …or a single flow while debugging
maestro test .maestro/login_flow.yaml
maestro test .maestro/flow_critical_path.yaml
```

Maestro prints each step and a ✓ / ✗ per flow. Green across the board = the app's
critical user journeys work end-to-end.

---

## The flows

| File | What it proves |
|---|---|
| `boot_verification.yaml` | the app boots to the Lobby cleanly |
| `login_flow.yaml` | sign-in via the Profile tab prompt |
| `auth_flow.yaml` / `auth_deep_link.yaml` | auth + deep-link entry |
| `flow_critical_path.yaml` | login → search → log a film → **it persists** |
| `log_film_flow.yaml` / `film_log.yaml` | logging a film |
| `darkroom_search.yaml` | film search |
| `browse_vault.yaml` | the vault/collections |
| `social_pulse_flow.yaml` | the home feed / pulse |
| `lounge_flow.yaml` | lounge chat |
| `offline_resilience.yaml` | offline queue behavior |
| `error_recovery.yaml` | graceful error handling |

---

## Notes

- **iOS** E2E needs a Mac (Xcode + simulator). **Android** works on macOS, Linux,
  or Windows-via-WSL — start there.
- **Automating in CI** is possible and free (Android emulator on GitHub's free
  Linux runners), but building the Expo app inside CI needs a debugging pass — set
  it up once you can watch a CI run and iterate. Local runs are the reliable path
  pre-launch.
