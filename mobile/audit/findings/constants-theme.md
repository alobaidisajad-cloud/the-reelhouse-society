# Findings — `src/constants/*` and `src/theme/*`

All files read in full: `constants/{deepLinks,membership,textScaling,cacheKeys,formats,index}.ts`, `theme/{theme,shaders,authStyles}.ts`.

Overall: **elite tier.** `deepLinks.ts` (allowlist + URL-scheme guard) is genuinely best-practice security hygiene. `theme.ts` is a clean, fully-documented token system. Only minor/polish items.

---

## LOW / POLISH

### CONST-1 (LOW) — "Derived" sepia rgba tokens aren't derived from the base sepia
**File:** `src/theme/theme.ts:23-27` vs `:8`

`colors.sepia` is `#B8891A` = `rgb(184,137,26)`, but `sepiaFaint`/`sepiaSubtle`/`sepiaBorder*` are built from `rgba(196,150,26,…)` = `#C4961A` — a visibly brighter gold. They're labelled "Derived" but use a different hue than the source token, so adjusting `colors.sepia` won't flow through. Same brighter value is hardcoded in `authStyles.ts:52` (`rgba(196,150,26,0.3)`) and `theme.ts:112` (`textGlowSepia`).
**Fix:** Either define the rgba tokens from the actual base channels (184,137,26) or rename them so they aren't presented as derived. Cosmetic, but it's a real inconsistency in a "single source of truth" design system.

### CONST-2 (LOW) — `constants/index.ts` barrel omits `formats` and `textScaling`
**File:** `src/constants/index.ts:7-9`

The barrel's doc says "Single import point for all constants" but only re-exports `cacheKeys`, `deepLinks`, `membership`. `formats.ts` and `textScaling.ts` are imported directly elsewhere, contradicting the stated convention.
**Fix:** Add the two `export *` lines, or soften the doc comment.

### CONST-3 (LOW, cross-ref) — Hardcoded membership prices risk drift from StoreKit/Play localized pricing
**File:** `src/constants/membership.ts:28-30,56-57`

Prices (`'1.99'`, `'BILLED ANNUALLY ($19.99/YR)'`, etc.) are hardcoded display strings "matching web exactly." Real charges come from RevenueCat/StoreKit, which localizes price and currency per region. Hardcoded USD strings will mismatch what international users are actually charged, and won't track price changes made in App Store Connect.
**Fix:** Source displayed prices from the RevenueCat offering's localized `priceString` where shown next to a purchase CTA; keep hardcoded copy only for non-transactional marketing. (Verify actual usage during the `app/(modals)/membership.tsx` audit — flagged there too.)

---

## Confirmed elite (no action)
- `src/constants/deepLinks.ts` — allowlisted screens + type guard + URL-scheme allowlist blocking `tel:`/`sms:`/`intent:`/`javascript:`. Exactly right for handling untrusted push payloads.
- `src/constants/textScaling.ts` — Dynamic Type support with capped multipliers; decorative vs body vs display variants. Thoughtful accessibility.
- `src/constants/cacheKeys.ts`, `formats.ts` — clean, centralized.
- `src/theme/theme.ts` — comprehensive tokens; documents WCAG contrast for `fog` (4.62:1 on ink), spring physics, typography scale.
- `src/theme/shaders.ts` — documents the iOS Metal black-screen alpha workaround.
- `src/theme/authStyles.ts` — idiomatic StyleSheet, no dead styles observed.
