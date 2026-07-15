# Android Launch Runbook

> Written 2026-07-13 from a full Android-readiness audit. **Status: the app is
> iOS-first; Android is NOT launch-ready by configuration** (payments + push
> have no Android wiring) and has never been run on an Android device.
> The codebase itself is Android-aware (24 Platform branches, `elevation`
> fallbacks in 35 files, `includeFontPadding: false` throughout, adaptive +
> monochrome icons, `edgeToEdgeEnabled`, `dimezisBlurView` on the nav bars) —
> the gaps below are wiring + verification, not architecture.

## 1 · Blocking config (no code) — do these FIRST

| # | Task | Where | Why |
|---|------|-------|-----|
| 1 | Google Play Console account + app listing (`com.reelhouse.society`) | play.google.com/console (~$25 once) | Prerequisite for everything below |
| 2 | RevenueCat: add the Google Play app, configure the SAME products/entitlements (archivist/auteur/founding), copy the **public Google API key** | RC dashboard | Without it `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` is empty → `revenueCat.ts:55-57` skips configure → **purchases dead on Android** (graceful, no crash) |
| 3 | Add `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` to `eas.json` production env (next to the iOS key) | `eas.json` | The code already reads it — key only |
| 4 | Firebase project → register the Android app → download `google-services.json` → reference via `android.googleServicesFile` in `app.json` → `eas credentials` for FCM | Firebase console | Without FCM, `getExpoPushTokenAsync` throws on Android → caught (`pushNotifications.ts:64→109`) → **push silently dead**. The Android notification channel is ALREADY coded (`pushNotifications.ts:91`) |
| 5 | In-app products in Play Console matching RC product ids | Play Console | RC serves offerings from Play |

## 2 · Code items to verify ON A DEVICE (deliberately NOT fixed blind)

These are Android-only props (inert on iOS) but with device-visible effects —
changing them blind on an untested platform risks creating bugs worse than the
ones they fix. Verify each on the first Android build:

- **View shadows with no `elevation`** → shadows render invisible on Android
  (flatness, not breakage). Files (view-shadow count):
  `feed/AutopsyView.tsx` (2) · `film/FilmActionRow.tsx` (1) ·
  `film/FilmSectionHeader.tsx` (1) · `home/MarqueeBoard.tsx` (1) ·
  `home/SocialPulse.tsx` (2) · `log/LogModalStyles.ts` (1) ·
  `moderation/ReportSheet.tsx` (1) · `Preloader.tsx` (5) ·
  `profile/AvatarCropSheet.tsx` (1) · `profile/profileStyles.ts` (5).
  CAUTION: `elevation` changes Android z-order and needs opaque backgrounds —
  add per-view with eyes on the screen, not in bulk.
- **Transparent full-screen `<Modal>`s without `statusBarTranslucent`** — with
  `edgeToEdgeEnabled` the dim/blur backdrop may stop at a status-bar-height
  strip. Precedent: `dispatch/ArticleReaderModal.tsx` already sets it. ~20
  files (see `grep -rln "<Modal" | xargs grep -L statusBarTranslucent`).
- **BlurView degradation** — 19 files use BlurView; only the two nav bars set
  `experimentalBlurMethod="dimezisBlurView"`. The other 17 render as a plain
  tint on Android (acceptable — most pair the blur with an rgba overlay), but
  eyeball each sheet. Blanket-enabling dimezis is a PERF risk on old devices.
- **`.springify()` feel** — 8 components; spring physics can feel different on
  Android's frame pacing.
- **Keyboard flows** — `useAnimatedKeyboard` in `CreateLoungeSheet` is already
  iOS-branched (`Platform.OS === 'ios' ? keyboard.height : 0`); verify Android
  keyboard behavior in: log form, lounge chat composer, search modals, DataVault.

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
