# Findings — `src/types/*`

Module read in full: `film.types.ts`, `profile.types.ts`, `social.types.ts`, `tmdb.types.ts`, `moderation.ts`, `mutations.ts`, `ui.types.ts`, `index.ts`, `DEPRECATION_GUIDE.md`, and the four ambient `*.d.ts` files.

Overall: **strong**. Well-documented, single-source-of-truth Zod+infer patterns (`moderation.ts`, `mutations.ts` are exemplary), good barrel hygiene, deprecations tracked in a dedicated guide. Two real issues (one HIGH, surfaced via a `.d.ts`), plus a maintainability theme.

---

## HIGH

### TYPES-1 (HIGH, borderline CRITICAL) — `flash-list.d.ts` masks a dead `inverted` prop; lounge chat renders wrong
**Files:** `src/types/flash-list.d.ts:18`, `app/lounge/[id].tsx:428,507`, `src/stores/lounge.ts:302,327-328,355-393`

`flash-list.d.ts` augments `FlashListProps` to re-accept `inverted`, `estimatedItemSize`, `keyboardShouldPersistTaps`, `keyboardDismissMode`, `removeClippedSubviews` — props **removed in FlashList v2**. The file's own comment admits they are "accepted as no-op." Verified against the installed package: `node_modules/@shopify/flash-list@2.0.2` contains **zero** references to `inverted` in `dist/` or `src/` — the prop is genuinely ignored at runtime.

The damage is concrete in the lounge chat:
- `src/stores/lounge.ts:302` fetches messages `created_at` descending then `.reverse()` → `currentMessages` is **oldest→newest**, and the comment at `:327-328` states "UI renders from bottom" — i.e. the design *requires* an inverted list.
- `app/lounge/[id].tsx:507` sets `inverted: true`; `:428` ("FIX #4") removed the manual `.reverse()` *relying on inverted to handle display order*.
- Because `inverted` is a no-op: the list opens scrolled to the **top = oldest** message (user must scroll down to see the latest), `onEndReached` (`:511`) fires at the **bottom (newest)** while `loadMoreMessages` (`store:368`) loads **older** messages and prepends them → infinite scroll triggers at the wrong end and older history never loads when the user scrolls up. The `olderMessage = currentMessages[index+1]` grouping (`:517`) also compares the wrong neighbor.

**Why it matters:** Every user, every time they open a screening-room chat, lands on the oldest message with broken pagination. This is a reachable, always-on correctness regression on a primary social feature. Static confidence is high; exact on-screen symptom should be confirmed on device.

**Fix:** Stop relying on the dead prop. FlashList v2 has no `inverted`; render `currentMessages` oldest→newest (as stored) in a normal list and (a) scroll to end on load / use `maintainVisibleContentPosition` to pin the bottom on new messages, and (b) drive pagination from the *top* (scroll-near-top), not `onEndReached`.

**Correction (post deep-dive):** `keyboardShouldPersistTaps`/`keyboardDismissMode` are NOT no-ops — FlashList v2's `FlashListProps extends Omit<ScrollViewProps, "maintainVisibleContentPosition">`, so those ScrollView props are inherited and valid. Only `inverted` (and `estimatedItemSize`, harmlessly ignored since v2 auto-sizes) are genuinely gone. The `.d.ts` re-declarations of the ScrollView props are merely redundant, not masking bugs.

**STATUS: FIXED** on branch `fix/lounge-flashlist-v2-chat-ordering` (`app/lounge/[id].tsx`). Replaced `inverted` with `maintainVisibleContentPosition: { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }`, switched `onEndReached`→`onStartReached` (verified `loadMoreMessages` anchors on `currentMessages[0]` = oldest/top), and fixed author-grouping `index+1`→`index-1`. tsc + eslint clean. **Still needs on-device visual confirmation** (initial bottom position, autoscroll on new message, scroll-up pagination, author grouping). The `flash-list.d.ts` cleanup (removing the genuinely-dead `inverted`/`estimatedItemSize` entries) is deferred until the remaining FlashList screens are audited, since it would surface call sites across unread files.

---

## LOW / MEDIUM

### TYPES-2 (LOW) — `submit_report`/`ReportPayloadSchema` duplicate the moderation enums instead of reusing them
**Files:** `src/types/mutations.ts:81-82`, `src/types/moderation.ts:15-24,31-41`

`mutations.ts` inlines the `content_type` and `reason` enum string lists rather than importing `ReportableContentType` / `ReportReason` from `moderation.ts` (which already export reusable `z.enum`s). If a new reportable surface or reason is added to `moderation.ts`, the offline-queue validation schema silently drifts and won't validate the new value.
**Fix:** `reason: ReportReason, content_type: ReportableContentType` (import the z.enums). Low effort, removes a real drift vector.

### TYPES-3 (MEDIUM, maintainability theme) — fragmented "log"/"vault item" shapes with `any` and dual snake/camel aliases
**Files:** `src/types/film.types.ts:9-66,68-95`, `src/types/profile.types.ts:5-51`

There are at least three near-duplicate log shapes (`DomainLog`, `ProfileLog`) and several vault-item shapes (`VaultItem`, `ProfileVaultItem`, `PhysicalArchiveItem`) that overlap heavily but differ in nullability and field naming. `ProfileLog` uses `autopsy?: any` and `viewingHistory?: any[]` (`profile.types.ts:43-45`), defeating strict mode locally. Pervasive dual `poster`/`poster_path` and `created_at`/`createdAt` aliases push DB-boundary normalization responsibility onto every consumer and the mappers.
**Why it's a gap (not a nit):** every duplicated shape is a place a mapping bug can hide, and `any` removes the compiler's help exactly where the data is most polymorphic (`autopsy`, `viewingHistory`). This is documented as transitional (`DEPRECATION_GUIDE.md`), but the consolidation hasn't happened.
**Fix:** Converge on `DomainLog` as the single internal log type (derive `ProfileLog` via `Pick`/`Omit`), type `autopsy`/`viewingHistory` concretely (the viewing-history element type already exists inline in `DomainLog`), and confine snake_case to row types at the service boundary so the domain layer is camelCase-only. Not blocking; pays down a recurring tax.

---

### TYPES-4 (MEDIUM) — Stale `react-native-purchases.d.ts` stub; payments layer is untyped (`any`)
**Files:** `src/types/react-native-purchases.d.ts:9-12`, `src/lib/revenueCat.ts:44,61-62`

The stub `declare module 'react-native-purchases' { const Purchases: unknown; export default Purchases }` exists to "prevent TS2307 when the package is not yet installed." But the package **is** installed (`react-native-purchases@^10.0.1`) and ships full types (`dist/index.d.ts` with `customerInfo`, `offerings`, `purchases`, `errors`). The stub now actively shadows those real types — any `import type { PurchasesPackage } from 'react-native-purchases'` would resolve to `unknown`. Compounding this, `revenueCat.ts:44` types the SDK handle as `let Purchases: any`, so every entitlement parse and purchase call (`getCustomerInfo`, `purchasePackage`, `restorePurchases`, …) is unchecked. This is the money-handling layer running with the compiler turned off.
**Why it matters:** entitlement/purchase parsing bugs are exactly the class of defect strict typing exists to catch, and they have direct revenue/access consequences.
**Fix:** Delete the stub. Keep the lazy `await import(...)` for bundle reasons but type the handle: `let Purchases: typeof import('react-native-purchases').default | null`. Then `parseEntitlements`, offerings, and purchase flows get real types. (Re-examined in the `src/lib/revenueCat.ts` audit.)

---

## Confirmed elite (no action)
- `src/types/moderation.ts` — single source of truth, Zod schema + `z.infer` co-located types, conditional `.refine` for "other" reason. Exemplary.
- `src/types/mutations.ts` — per-mutation field-existence schemas with a documented rationale for `z.string()` vs `.uuid()` and `.passthrough()`. Thoughtful (aside from TYPES-2 DRY nit).
- `src/types/index.ts`, `ui.types.ts`, `tmdb.types.ts`, `social.types.ts` — clean, accurate, well-scoped.
