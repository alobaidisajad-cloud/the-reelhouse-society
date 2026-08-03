/**
 * RevenueCat — In-App Purchase & Subscription Management
 *
 * Apple/Google-compliant monetization layer for ReelHouse Society.
 * Handles subscription lifecycle, entitlement checks, restore purchases,
 * and syncs tier status back to Supabase.
 *
 * Setup instructions:
 * 1. Create a RevenueCat account at https://app.revenuecat.com
 * 2. Create iOS + Android app, configure products matching:
 *    - "archivist_monthly" ($1.99/mo)
 *    - "archivist_annual" ($19.99/yr)
 *    - "auteur_monthly" ($4.99/mo)
 *    - "auteur_annual" ($49.99/yr)
 *    - "founding_lifetime" ($49 one-time)
 * 3. Set EXPO_PUBLIC_REVENUECAT_IOS_KEY and EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
 *    in your .env file
 * 4. Install: npx expo install react-native-purchases
 */

import { Platform } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { enqueueMutation, flushOfflineQueue } from '../utils/offlineQueue';
import { resolveTier } from '../utils/tier';

// ── Type Definitions (no runtime dependency until package is installed) ──
// These mirror RevenueCat's actual types for type-safety before the package exists

export type ReelHouseTier = 'cinephile' | 'archivist' | 'auteur' | 'founding';

export interface EntitlementInfo {
  tier: ReelHouseTier;
  isActive: boolean;
  expiresAt: string | null;
  willRenew: boolean;
  productIdentifier: string | null;
}

// ── Configuration ──
const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

// TYPES-4: the package is installed, so type against the real SDK (the stale
// `react-native-purchases.d.ts` stub that shadowed these as `unknown` is deleted).
let Purchases: typeof import('react-native-purchases').default | null = null;
let isConfigured = false;

/**
 * Initialize RevenueCat — call once in _layout.tsx after auth restore.
 * Safe to call even if the package isn't installed (graceful no-op).
 */
export async function initRevenueCat(userId?: string): Promise<void> {
  const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;

  if (!apiKey) {
    // No key ⇒ monetization is entirely disabled. Surface it (forwarded to
    // Sentry in prod, deduped by fingerprint) so a missing-config build is
    // visible rather than silently selling nothing.
    logger.warn('[revenueCat] No API key configured — monetization disabled', { platform: Platform.OS });
    return;
  }

  try {
    // Dynamic import so the app doesn't crash if package isn't installed yet
    const RNPurchases = await import('react-native-purchases');
    Purchases = (RNPurchases.default ?? RNPurchases) as typeof import('react-native-purchases').default;

    await Purchases.configure({ apiKey, appUserID: userId ?? null });
    isConfigured = true;

    logger.info('[revenueCat] Initialized successfully');
  } catch (err) {
    // A failed dynamic import / configure leaves isConfigured=false, so every
    // entitlement & purchase call silently no-ops. This is the single failure
    // that disables ALL monetization — report it (stack preserved via logger.error).
    logger.error('[revenueCat] Failed to initialize — monetization disabled', err);
  }
}

export function parseEntitlements(customerInfo: CustomerInfo | null): EntitlementInfo {
  const fallback: EntitlementInfo = {
    tier: 'cinephile',
    isActive: false,
    expiresAt: null,
    willRenew: false,
    productIdentifier: null,
  };

  if (!customerInfo) return fallback;

  const entitlements = customerInfo.entitlements?.active;
  if (!entitlements) return fallback;

  // Check in priority order: founding > auteur > archivist
  if (entitlements.founding) {
    return {
      tier: 'founding',
      isActive: true,
      expiresAt: null, // Lifetime
      willRenew: false,
      productIdentifier: entitlements.founding.productIdentifier,
    };
  }

  if (entitlements.auteur) {
    return {
      tier: 'auteur',
      isActive: true,
      expiresAt: entitlements.auteur.expirationDate ?? null,
      willRenew: entitlements.auteur.willRenew !== false,
      productIdentifier: entitlements.auteur.productIdentifier,
    };
  }

  if (entitlements.archivist) {
    return {
      tier: 'archivist',
      isActive: true,
      expiresAt: entitlements.archivist.expirationDate ?? null,
      willRenew: entitlements.archivist.willRenew !== false,
      productIdentifier: entitlements.archivist.productIdentifier,
    };
  }

  return fallback;
}

/**
 * Check current entitlements — returns the user's active tier.
 * Falls back to 'cinephile' (free) if no active subscription.
 */
export async function checkEntitlements(): Promise<EntitlementInfo> {
  if (!isConfigured || !Purchases) return parseEntitlements(null);

  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return parseEntitlements(customerInfo);
  } catch (e) {
    logger.warn('[revenueCat] checkEntitlements failed', e);
    return parseEntitlements(null);
  }
}

/**
 * Get available offerings (subscription packages).
 * Returns structured data ready for the membership screen UI.
 */
export async function getOfferings(): Promise<any[]> {
  if (!isConfigured || !Purchases) return [];

  try {
    const offerings = await Purchases.getOfferings();
    if (!offerings.current) return [];
    return offerings.current.availablePackages ?? [];
  } catch (e) {
    logger.info('[revenueCat] getOfferings failed', e);
    return [];
  }
}

/**
 * Purchase a subscription package.
 * Returns the updated entitlement info on success.
 */
export async function purchasePackage(pkg: any): Promise<EntitlementInfo | null> {
  if (!isConfigured || !Purchases) return null;

  try {
    // Atomic Parsing: extract entitlement directly from the purchase payload
    // This completely eliminates the post-purchase network race condition!
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const entitlement = parseEntitlements(customerInfo);

    // Sync tier to Supabase backend
    // ALWAYS sync, even if inactive, to ensure downgrades are properly recorded
    await syncEntitlementToSupabase(entitlement.tier);

    return entitlement;
  } catch (err: any) {
    // User cancelled — not an error
    if (err?.userCancelled) return null;
    throw err;
  }
}

/**
 * Gather every purchasable package across ALL configured offerings.
 *
 * `getOfferings()` only returns `offerings.current`, which is a single
 * offering. RevenueCat dashboards are commonly set up with one offering per
 * tier (so `current` holds just one tier's packages) OR a single offering
 * holding every tier. Collecting from `current` first and then every entry in
 * `offerings.all` makes tier resolution work under either topology. Deduped by
 * package + product identifier so the same package isn't considered twice.
 */
async function collectPurchasablePackages(): Promise<any[]> {
  if (!isConfigured || !Purchases) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const seen = new Set<string>();
    const out: any[] = [];
    const push = (pkgs: any[] | undefined | null) => {
      for (const p of pkgs ?? []) {
        const key = `${p?.identifier}::${p?.product?.identifier}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(p);
      }
    };
    push(offerings?.current?.availablePackages);
    const all = offerings?.all ?? {};
    for (const key of Object.keys(all)) push(all[key]?.availablePackages);
    return out;
  } catch (e) {
    logger.info('[revenueCat] collectPurchasablePackages failed', e);
    return [];
  }
}

export interface TierPricing {
  monthly?: string;
  annual?: string;
  /** One-time price (the Founding seat). Same shape as the recurring ones. */
  lifetime?: string;
  /** Numeric store prices + currency — power the honest "≈ $X.XX / MO" line
   *  under annual billing. Optional: absent when the SDK doesn't expose them,
   *  and the UI simply omits the equivalence line (never shows a wrong number). */
  monthlyPrice?: number;
  annualPrice?: number;
  lifetimePrice?: number;
  currencyCode?: string;
}

/**
 * CONST-3: resolve localized store prices per tier so the membership UI can
 * show the REAL StoreKit/Play price (and currency) instead of hardcoded USD
 * that drifts from the stores. Keyed by tier id (`archivist` / `auteur`) with
 * each tier's monthly + annual `priceString`. Returns `{}` when RC isn't
 * configured/available — callers fall back to the static copy in
 * `constants/membership.ts`.
 */
export async function getTierPricing(): Promise<Record<string, TierPricing>> {
  const packages = await collectPurchasablePackages();
  const out: Record<string, TierPricing> = {};
  for (const p of packages) {
    const productId = String(p?.product?.identifier ?? '').toLowerCase();
    const priceString = typeof p?.product?.priceString === 'string' ? p.product.priceString : undefined;
    if (!priceString) continue;
    // ⚠️ #98 — 'founding' was missing here and LIFETIME was dropped by the period
    // check below, so the Founding card had no store price to show and fell back to a
    // "$49" typed into the screen. Archivist and Auteur showed real localized prices
    // beside it, so a member in the UK or Japan saw two real prices and one US dollar
    // figure — wrong, and an App Store metadata risk.
    const tierId = ['archivist', 'auteur', 'founding'].find((t) => productId.startsWith(t));
    if (!tierId) continue;
    const pType = String(p?.packageType ?? '').toUpperCase();
    const period: 'monthly' | 'annual' | 'lifetime' | undefined =
      productId.includes('annual') || pType === 'ANNUAL' ? 'annual'
      : productId.includes('monthly') || pType === 'MONTHLY' ? 'monthly'
      : productId.includes('lifetime') || pType === 'LIFETIME' ? 'lifetime'
      : undefined;
    if (!period) continue;
    const priceNum = typeof p?.product?.price === 'number' && isFinite(p.product.price) ? p.product.price : undefined;
    const currencyCode = typeof p?.product?.currencyCode === 'string' ? p.product.currencyCode : undefined;
    out[tierId] = {
      ...out[tierId],
      [period]: priceString,
      ...(priceNum !== undefined ? { [`${period}Price`]: priceNum } : {}),
      ...(currencyCode ? { currencyCode: out[tierId]?.currencyCode ?? currencyCode } : {}),
    };
  }
  return out;
}

/**
 * Resolve the RevenueCat package to purchase for a given tier.
 *
 * Critically, this matches on the **store product identifier**
 * (`pkg.product.identifier` — e.g. `auteur_annual`, `founding_lifetime`, per
 * the products documented at the top of this file) and the **packageType**,
 * NOT the package identifier. RevenueCat's predefined packages carry
 * identifiers like `$rc_annual` / `$rc_lifetime`, which never contain the tier
 * name — so the previous `pkg.identifier.includes(tier)` match silently failed
 * for every standard-configured dashboard, making all purchases impossible.
 *
 * Match order (most precise → most lenient); the final step preserves the
 * original package-identifier behavior so custom-named packages still resolve:
 *   1. Exact documented product id (`<tier>_<period>` / `founding_lifetime`).
 *   2. Product for this tier with the desired billing period.
 *   3. Custom package whose identifier encodes the tier + period.
 *   4. Any product for this tier (prefer selling a monthly over failing).
 *   5. Legacy: package identifier contains the tier name.
 *
 * BILLING CHOICE: when `period` is passed EXPLICITLY (the membership toggle),
 * resolution is STRICT — steps 4–5 are skipped, so a member who chose MONTHLY
 * can never be silently sold the annual product (or vice-versa) on a store
 * missing that period. No match → null → the caller shows an honest error.
 * When `period` is omitted (legacy callers, e.g. useEntitlement), behavior is
 * byte-identical to before: annual preferred, lenient fallback chain intact.
 * Founding is always the lifetime product regardless of `period`.
 *
 * Exported for unit testing — it is a pure function of its inputs.
 */
export type BillingPeriod = 'monthly' | 'annual';

export function selectPackageForTier(packages: any[], tier: ReelHouseTier, period?: BillingPeriod): any | null {
  if (!packages?.length) return null;
  const t = tier.toLowerCase();
  const wantsLifetime = tier === 'founding';
  const strict = !wantsLifetime && period !== undefined;
  const resolvedPeriod = wantsLifetime ? 'lifetime' : (period ?? 'annual');
  const wantType = wantsLifetime ? 'LIFETIME' : resolvedPeriod === 'annual' ? 'ANNUAL' : 'MONTHLY';
  const canonical = `${t}_${resolvedPeriod}`;

  const productId = (p: any) => String(p?.product?.identifier ?? '').toLowerCase();
  const pkgId = (p: any) => String(p?.identifier ?? '').toLowerCase();
  const pType = (p: any) => String(p?.packageType ?? '').toUpperCase();

  const periodMatch =
    packages.find((p) => productId(p) === canonical) ??
    packages.find((p) => productId(p).startsWith(t) && pType(p) === wantType) ??
    packages.find((p) => pkgId(p).includes(t) && (pkgId(p).includes(resolvedPeriod) || pType(p) === wantType)) ??
    null;

  if (strict) return periodMatch;

  return (
    periodMatch ??
    packages.find((p) => productId(p).startsWith(t)) ??
    packages.find((p) => pkgId(p).includes(t)) ??
    null
  );
}

/**
 * Helper to purchase by tier name without needing the full package object.
 * Pass `period` to honor an explicit monthly/annual choice (strict — see
 * selectPackageForTier); omit it for the legacy annual-preferred behavior.
 */
export async function purchaseTier(tier: ReelHouseTier, period?: BillingPeriod): Promise<EntitlementInfo | null> {
  if (!isConfigured || !Purchases) return null;
  try {
    const packages = await collectPurchasablePackages();
    const pkg = selectPackageForTier(packages, tier, period);
    if (!pkg) throw new Error(`No package found for tier: ${tier}`);
    return await purchasePackage(pkg);
  } catch (err: any) {
    if (err?.userCancelled) return null;
    throw err;
  }
}

/**
 * Restore previous purchases — required by Apple for App Store compliance.
 * Use when a user reinstalls the app or switches devices.
 */
/**
 * The result of a restore, including whether the store could be consulted AT ALL.
 *
 * ⚠️ #99 — this distinction is the whole point. Three completely different outcomes
 * used to collapse into one identical `isActive: false`:
 *
 *   1. the store could not be reached (no signal, App Store down)
 *   2. purchases are not configured on this build/device
 *   3. the store answered, and this account genuinely has no subscription
 *
 * Only (3) means "you have no subscription". The screen could not tell them apart, so
 * it treated all three the same — told a paying member "No active subscriptions found"
 * and stripped their tier locally, on the exact tap a confused member makes when
 * something looks wrong. And "Restore Purchases" is a button Apple REQUIRES.
 */
export interface RestoreResult extends EntitlementInfo {
  /** True only when the store actually answered. False means "we don't know". */
  storeReachable: boolean;
}

export async function restorePurchases(): Promise<RestoreResult> {
  if (!isConfigured || !Purchases) {
    // Not "you own nothing" — "we could not ask".
    logger.warn('[revenueCat] restorePurchases: SDK unavailable, cannot consult the store');
    return { ...parseEntitlements(null), storeReachable: false };
  }

  try {
    // Atomic Parsing: extract entitlement directly from restore payload
    const customerInfo = await Purchases.restorePurchases();
    const entitlement = parseEntitlements(customerInfo);

    // Sync restored tier to Supabase.
    // Still ALWAYS sync, including an inactive result, so a genuinely lapsed
    // subscription is retired — the store ANSWERED here, so the answer is authoritative
    // for purchases the store made. Whether the downgrade is actually allowed is decided
    // server-side by grant_entitlement, which refuses to lower a tier bought on the
    // website or granted by hand (20260803_01_entitlement_source.sql).
    await syncEntitlementToSupabase(entitlement.tier);

    return { ...entitlement, storeReachable: true };
  } catch (e) {
    // The store threw — we learned nothing. Deliberately does NOT sync: sending a
    // downgrade off a failed lookup is exactly how a paying member gets demoted.
    logger.warn('[revenueCat] restorePurchases failed', e);
    return { ...parseEntitlements(null), storeReachable: false };
  }
}

/**
 * Sync the entitlement tier to Supabase `profiles.role`.
 * This ensures the backend always has the current subscription status.
 */
async function syncEntitlementToSupabase(tier: ReelHouseTier): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // VIP Database Corruption Shield
    // Prevent client-side downward syncs from destroying manually granted founding VIPs.
    const { useAuthStore } = await import('../stores/auth');
    const currentRole = resolveTier(useAuthStore.getState().user);

    if (currentRole === 'founding' && tier !== 'founding') {
       logger.info('[revenueCat] Protected manual founding grant from downward sync');
       return;
    }

    // Securely queue the sync through the MMKV offline queue.
    // This guarantees delivery if the network drops and ensures the transaction
    // is securely validated by the Edge Function instead of trusting the client.
    //
    // ⚠️ user_id is what stops this being applied to the WRONG ACCOUNT. The queue
    // discards pending work belonging to a previous user, but only when the payload
    // says who it belongs to — without it the mutation is treated as session-scoped
    // and runs against whoever is signed in when the network returns. Hand the phone
    // over, or just log out and let someone else log in, and your tier landed on their
    // account. See the note on sync_entitlement in types/mutations.ts.
    enqueueMutation({ type: 'sync_entitlement', payload: { tier, user_id: user.id } });
    flushOfflineQueue();
  } catch (e) {
    logger.warn('[revenueCat] Entitlement sync enqueue failed', e);
  }
}

/**
 * Log the user into RevenueCat with their Supabase user ID.
 * Call after authentication to link purchases to the user.
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!isConfigured || !Purchases) return;

  try {
    await Purchases.logIn(userId);
  } catch (e) {
    logger.info('[revenueCat] identifyUser failed', e);
  }
}

/**
 * Log the user out of RevenueCat.
 * Call on logout to prevent purchase association with wrong user.
 */
export async function logoutRevenueCat(): Promise<void> {
  if (!isConfigured || !Purchases) return;

  try {
    await Purchases.logOut();
  } catch (e) {
    logger.info('[revenueCat] logoutRevenueCat failed', e);
  }
}
