# Android Launch Runbook

> Written 2026-07-13 from a full Android-readiness audit; read against the code
> again 2026-10-03. **DECISION: iOS and Android launch TOGETHER** — §1
> (accounts/keys) and the §4 device pass are therefore PRE-LAUNCH requirements,
> not a later milestone. Android runs on every push in the sealed E2E world
> (e2e.yml, an emulator), but has never run on a physical device; payments and
> push have no Android wiring until §1 is done. The codebase itself is
> Android-aware (Platform branches, `elevation` fallbacks, `includeFontPadding:
> false` throughout, adaptive + monochrome icons, `edgeToEdgeEnabled`,
> `dimezisBlurView` on the nav bars) — the gaps below are wiring + verification,
> not architecture.

## 1 · Blocking config (no code) — do these FIRST

| # | Task | Where | Why |
|---|------|-------|-----|
| 1 | Google Play Console account + app listing (`com.reelhouse.society`) | play.google.com/console (~$25 once) | Prerequisite for everything below |
| 2 | RevenueCat: add the Google Play app, configure the SAME products/entitlements (archivist/auteur/founding), copy the **public Google API key** | RC dashboard | Without it `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` is empty → revenueCat.ts skips configure → **purchases dead on Android** (graceful, no crash) |
| 3 | Add `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` to `eas.json` production env (next to the iOS key) | `eas.json` | The code already reads it — key only |
| 4 | Firebase project → register the Android app → download its Google services config (JSON) → reference via `android.googleServicesFile` in `app.json` → `eas credentials` for FCM | Firebase console | Without FCM, `getExpoPushTokenAsync` throws on Android → caught in `registerForPushNotifications` → **push silently dead**. The Android notification channel is ALREADY coded (pushNotifications.ts) |
| 5 | In-app products in Play Console matching RC product ids | Play Console | RC serves offerings from Play |

## 2 · Code items to verify ON A DEVICE (deliberately NOT fixed blind)

These have device-visible effects on Android that no emulator run or render
measures. Verify each on the first Android build:

- ~~View shadows with no `elevation`~~ — **DONE.** Read again 2026-10-03: no
  view in the files this listed carries a shadow without `elevation` (two of
  them no longer exist; the Preloader's are text shadows, which Android draws).
  On the device pass, confirm cards and sheets are not flat.
- ~~Transparent `<Modal>`s without `statusBarTranslucent`~~ — **DONE.** All 18
  transparent modals set it (counted 2026-10-03). On the device pass just
  confirm backdrops reach the top edge and no modal content sits under the
  status bar.
- **BlurView degradation** — 19 files use BlurView; only the two nav bars set
  `experimentalBlurMethod="dimezisBlurView"`. The others render as a plain
  tint on Android (acceptable — most pair the blur with an rgba overlay), but
  eyeball each sheet. Blanket-enabling dimezis is a PERF risk on old devices.
- **Keyboard flows** — edge-to-edge stops Android resizing the window for the
  keyboard; `KeyboardRoom` at the root restores it, and the composers measure
  the keyboard with `useAnimatedKeyboard`. Verify on the device: the log form,
  the lounge composer, the Dispatch composer, the search and stack sheets.

## 3 · Verified fine already (no action)

- Push registration fails gracefully without FCM (full try/catch) and the
  Android channel (`setNotificationChannelAsync('default', MAX)`) is coded.
- RevenueCat no-key guard is graceful (logs + skips, no crash).
- Backend (Supabase/auth/RLS/RPCs) is platform-agnostic.
- Fonts via @expo-google-fonts; `includeFontPadding: false` used app-wide.
- `app.json` android block complete: package, adaptiveIcon (+ monochrome),
  edge-to-edge. `eas.json` e2e profile builds an APK for local testing.

## 4 · Ship sequence

1. Complete §1 (accounts/keys/FCM).
2. `eas build --profile e2e --platform android` (APK) → install on a real
   device (mid-range Android preferred, not a flagship).
3. Walk the core loops: onboarding → log a film → profile counts → lounge
   chat (+ covers) → tribunal (admin) → **a real sandbox purchase** → a push.
4. Work §2 with eyes on the screen; fix per-item.
5. Closed testing track → production rollout (staged %).
