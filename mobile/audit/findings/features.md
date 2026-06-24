# Findings — `src/features/*`

Read in full (logic): `archive/archiveImport.ts` (1182), `settings/DataVault.tsx` (519), `settings/SettingsScreen.tsx` (512), `settings/SettingsSections.tsx` (446), `profile/EditProfileScreen.tsx` (246), `profile/LinksEditor.tsx` (79). The two pure-StyleSheet files (`settings/settings.styles.ts`, `profile/profile.styles.ts`) are trivial token objects — not individually line-audited.

Overall: **elite, and notably security-conscious.** `SettingsScreen` gates destructive actions (sign-out, account deletion) behind biometric step-up auth with OTP-email fallback; `PasswordChangePanel` re-verifies the current password before changing and detects OAuth accounts; `DataVault` export uses `escapeCsvCell` (formula-injection safe) + temp-file cleanup; `archiveImport` has a 20MB guard, idempotent batch upserts, and partial-success error collection. Two LOW items.

---

## LOW

### FEAT-1 (LOW) — Import paths bypass the `sanitizeInput` mutation choke point
**Files:** `src/features/archive/archiveImport.ts` — `importLogs` (`:553-578`), `importArchiveJSON` (`:778-803`), list/watchlist importers.
Every interactive write path runs review/notes/comment text through `sanitizeInput` (strips zero-width/control chars, length caps). The bulk import paths write `review`/`private_notes`/`notes` **raw** from the external CSV/JSON. Low risk — it's the user's own re-imported data and the display layer strips HTML — but control/zero-width characters from a foreign export enter the DB unsanitized, inconsistent with every other write path.
**Fix:** Run imported free-text through `sanitizeInput` (with the matching field type) before upsert.

### FEAT-2 (LOW) — No decompressed-size guard on ZIP import (zip-bomb; self-inflicted only)
**File:** `src/features/archive/archiveImport.ts:1025-1047`
The 20MB limit is on the **compressed** ZIP; `JSZip` then decompresses entries unbounded (`.async('string')`). A maliciously-crafted ZIP could expand to gigabytes and exhaust memory. The only attack vector is a user importing a malicious file they themselves selected (no remote/cross-user path), so real-world risk is minimal — but it's an unbounded-decompression path. Also, the size check is skipped when `fileInfo.exists` is false.
**Fix:** Cap cumulative decompressed bytes / entry count while iterating ZIP entries; treat un-stat-able files conservatively.

### SCHEMA-4b reinforcement (LOW) — `LinksEditor` shows a "/10 LINKS" cap that isn't enforced
**Files:** `src/features/profile/LinksEditor.tsx:58` + `src/hooks/useEditProfile.ts:19` (inline schema, no `links.max(10)`).
The UI renders `{links.length}/10 LINKS` and the exported `EditProfileSchema` caps links at 10, but the *active* inline schema in `useEditProfile` omits the cap and `handleAddLink` just appends — so a user can add >10 links and see "11/10". (Folds into SCHEMA-4b: import the shared schema.)

---

## Confirmed elite (no action)
- `archive/archiveImport.ts` — RFC-4180 CSV state machine, format-agnostic header mapping, rating-scale auto-detect, DD/MM-vs-MM/DD date heuristic, cached/dedup/rate-limited TMDB resolution with year-fallback, 20MB guard, `__MACOSX` filtering, single-pass batch resolution, idempotent `ignoreDuplicates` upserts, event-loop yields, partial-success error collection.
- `settings/DataVault.tsx` — `escapeCsvCell` on every export cell, paginated `fetchAllRows`, temp-file cleanup in `finally`, sanitized filenames, size guards, `isMounted` guards, JSON export with nested `list_items`.
- `settings/SettingsScreen.tsx` — biometric + OTP step-up auth for sign-out/delete, `withTimeout`-guarded biometric checks, server-RPC account deletion, prefs-merge avoiding clobber, isDirty-aware form sync.
- `settings/SettingsSections.tsx` — password change re-verifies current password (step-up) + OAuth detection, react-hook-form `Controller` sections, tactile toggle MMKV+server sync.
- `profile/EditProfileScreen.tsx` — `InteractionManager`-deferred heavy sections, `FormProvider`, submitError type-guard.
- `profile/LinksEditor.tsx` — controlled field array (counter cap aside).
