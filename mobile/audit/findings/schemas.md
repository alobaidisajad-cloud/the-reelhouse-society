# Findings — `src/schemas/*`

Read in full: `user.ts`, `feed.schema.ts`, `dossier.schema.ts`, `film.schema.ts`, `profile.schema.ts`, `profile.ts`, `settings.ts`, `index.ts`. (Test file `__tests__/schemas.test.ts` noted, not line-audited.)

Overall: **elite tier.** This is the strongest part of the codebase so far. Boundary schemas with resilient coercion (`yearCoercer`), sensible defaults, polymorphic `profiles` join handling, and documented rationale for "required-but-nullable" so a column rename produces a parse failure (row dropped) rather than a silent blank card (`dossier.schema.ts:78-91`). Only LOW items.

---

## LOW

### SCHEMA-1 (LOW) — `EditProfileSchema` username regex is a looser duplicate of `validateUsername`; stale doc
**Files:** `src/schemas/profile.ts:17,21-24`, `src/hooks/useEditProfile.ts:131`

`EditProfileSchema.username` validates with inline `regex(/^[a-z0-9_]+$/)` + `min(3).max(30)`. This regex **accepts** `_filmfan`, `filmfan_`, `film__fan` (leading/trailing/double underscore), which `validateUsername` explicitly **rejects** (confirmed in `validateUsername.test.ts:82-94`). The real check is upheld because `useEditProfile.ts:131` calls `validateUsername(data.username)` at submit — so the single-source-of-truth claim holds at runtime — but the form-resolver regex will show a username as valid inline that the submit handler then rejects, producing inconsistent inline-vs-submit feedback. Also the JSDoc at `profile.ts:17` says "3-20 chars" while the code is `max(30)`.
**Fix:** Replace the inline regex with a `superRefine` calling `validateUsername` (as `ProfileUpdateSchema` already does), and fix the "3-20" comment to "3-30".

### SCHEMA-2 (LOW) — Settings privacy enums not enforced in the persisted preferences schema
**Files:** `src/schemas/settings.ts:11-12`, `src/schemas/user.ts:14-15`

`SettingsSchema` constrains `privacyEndorsements`/`privacyAnnotations` to `['everyone','followers','nobody']`, but these are persisted into `profiles.preferences` where `UserPreferencesSchema` types `privacy_endorsements`/`privacy_annotations` as bare `z.string().optional()`. The enum constraint is lost at the persistence boundary (and there's a camelCase↔snake_case remap maintained by hand). An out-of-enum value could be written and read back without a validation error.
**Fix:** Type those preference keys with the same `z.enum([...])` used in `SettingsSchema` (or share a single enum constant), so the constraint survives round-tripping.

### SCHEMA-3 (LOW) — `z.any()` used for JSONB fields instead of `z.unknown()`
**Files:** `src/schemas/feed.schema.ts:40,75,109`, `src/schemas/user.ts:22-23`

`autopsy`, `favorites`, `programmes` use `z.any()`, which leaks `any` into every inferred type and downstream consumer (defeating strict mode where these are read). `z.unknown()` validates identically at runtime (accepts anything) but forces consumers to narrow before use.
**Fix:** `z.unknown()` for arbitrary JSONB; or type `autopsy` concretely as `z.record(z.string(), z.number())` (the shape already used in `film.schema.ts:38`).

### SCHEMA-4 (LOW) — `DomainLogSchema` hand-mirrors the `DomainLog` interface (drift risk); confusing `profile.ts` vs `profile.schema.ts` split
**Files:** `src/schemas/film.schema.ts:6-63` vs `src/types/film.types.ts:9-66`; `src/schemas/profile.ts` & `profile.schema.ts`

`DomainLogSchema` is documented "Exact schema matching the DomainLog interface" but the two are maintained independently — nothing enforces they stay in sync (e.g. `createdAt` is `z.string().datetime()` in the schema vs a plain `string` in the interface; a non-ISO `createdAt` would parse-fail). Separately, having both `profile.ts` and `profile.schema.ts` (both barrel-exported, holding different profile schemas) is an organizational footgun.
**Fix:** Pick one direction — derive the `DomainLog` type from `z.infer<typeof DomainLogSchema>` so the compiler guarantees parity — and consolidate the two profile schema files (or rename for clear separation, e.g. `profileForm.schema.ts` vs `profileBoundary.schema.ts`).

---

## Confirmed elite (no action)
- `feed.schema.ts` — `yearCoercer`, `.transform(String)`/`.transform(Number)` id normalization, polymorphic `profiles: union(obj, array)`, factory defaults for `created_at`. Textbook boundary hardening.
- `dossier.schema.ts` — the "required-but-nullable so rename → parse failure not blank card" reasoning (`:78-91`) is exactly the right instinct.
- `user.ts` — `.catchall(z.unknown())` for forward-compat preferences; `User` interface re-derived from `z.infer` via `Omit` to handle the deprecated `following` field cleanly.
- `profile.schema.ts` `ProfileUpdateSchema` — `superRefine` delegating to the shared `validateUsername`; `.passthrough()` on read schema for migration tolerance.
