/**
 * RevenueCat — in-app purchases and subscriptions, through the App Store and
 * Google Play: buying, restoring, reading entitlements, and asking the server
 * to grant what the store says.
 *
 * The store products are `archivist_monthly`, `archivist_annual`,
 * `auteur_monthly`, `auteur_annual` and `founding_lifetime`; their prices live
 * in the stores (constants/membership.ts holds only the fallback copy). Each
 * platform's key is EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY.
 */

import { Platform } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { enqueueMutation, flushOfflineQueue } from '../utils/offlineQueue';
import { recordGateEvent } from '../utils/gateTelemetry';

// ── The app's own view of an entitlement ──
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

// The real SDK's types; the SDK itself is loaded on first configure.
let Purchases: typeof import('react-native-purchases').default | null = null;
let isConfigured = false;

/** Configure RevenueCat once, after the session is restored; any failure leaves it off. */
export async function initRevenueCat(userId?: string): Promise<void> {
  const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;

  if (!apiKey) {
    // No key: nothing can be sold. Said to Sentry, so the build is not silent.
    logger.warn('[revenueCat] No API key configured — monetization disabled', { platform: Platform.OS });
    return;
  }

  try {
    // Loaded here, so a missing native module is a caught failure, not a crash.
    const RNPurchases = await import('react-native-purchases');
    Purchases = (RNPurchases.default ?? RNPurchases) as typeof import('react-native-purchases').default;

    await Purchases.configure({ apiKey, appUserID: userId ?? null });
    isConfigured = true;

    logger.info('[revenueCat] Initialized successfully');
  } catch (err) {
    // The one failure that turns off every purchase: reported with its stack.
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

/** What `reconcileRank` found, and whether it changed anything. */
export type RankReconciliation =
  | 'unknown'          // could not find out — nothing was changed
  | 'active'           // the store says they are entitled
  | 'relinquished'     // the store says no, and the server lowered them
  | 'already-current'; // the store says no, and the server had nothing to lower

/**
 * ── A RANK THAT ENDS ────────────────────────────────────────────────────────
 * When the store positively says a subscription is over, the member's rank is
 * lowered (every server gate reads that rank). Not `checkEntitlements()`, whose
 * "inactive" also means "no SDK here" (no Android key is in eas.json) and "the
 * store could not be reached": acting on those would strip paying members.
 * "Not entitled" and "could not find out" are never the same answer here.
 *
 * The server is the backstop: `relinquish_rank` lowers only the CALLER's rank,
 * through `grant_entitlement`, which refuses to lower a rank another source
 * granted, so a hand-granted rank or a founding seat survives a wrong call.
 */
export async function reconcileRank(): Promise<RankReconciliation> {
  // Not configured is NOT "not entitled".
  if (!isConfigured || !Purchases) return 'unknown';

  let customerInfo: CustomerInfo;
  try {
    customerInfo = await Purchases.getCustomerInfo();
  } catch (e) {
    // A failure to ask is not an answer.
    logger.info('[revenueCat] reconcileRank: could not reach the store', e);
    return 'unknown';
  }

  const info = parseEntitlements(customerInfo);
  if (info.isActive) return 'active';

  // Now — and only now — the store has positively said there is no active
  // entitlement for this customer.
  try {
    const { data, error } = await supabase.rpc('relinquish_rank');
    if (error) {
      logger.warn(`[revenueCat] reconcileRank: ${error.message}`);
      return 'unknown';
    }
    const row = Array.isArray(data) ? data[0] : data;
    const applied = !!row?.out_applied;
    if (applied) {
      logger.info(`[revenueCat] rank relinquished: ${row?.out_reason ?? ''}`);
      recordGateEvent('rank_relinquished');
      return 'relinquished';
    }
    return 'already-current'; // refused for a reason, which `out_reason` names
  } catch (e) {
    logger.warn(`[revenueCat] reconcileRank: ${String(e)}`);
    return 'unknown';
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
    // The entitlement from the purchase's own answer, not a second fetch.
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const entitlement = parseEntitlements(customerInfo);

    await syncEntitlementToSupabase(entitlement.tier); // always, even if inactive

    return entitlement;
  } catch (err: any) {
    // User cancelled — not an error
    if (err?.userCancelled) return null;
    throw err;
  }
}

/**
 * Every package in EVERY offering (`current` first, then `all`), deduped: a
 * dashboard may hold one offering per tier or one for all of them.
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
  /** The store's numbers; absent, the page omits what it would compute from them. */
  monthlyPrice?: number;
  annualPrice?: number;
  lifetimePrice?: number;
  currencyCode?: string;
  /** The annual price per month, formatted BY THE STORE in local currency ("£1.67"). */
  annualPerMonth?: string;
}

/** Each rank's real store prices, localized; `{}` without a store (the page's copy stands in). */
export async function getTierPricing(): Promise<Record<string, TierPricing>> {
  return pricingFromPackages(await collectPurchasablePackages());
}

/**
 * The store's packages, read into prices per rank. A pure function of what the
 * store returned — exported so every rule in it runs under test, as
 * `selectPackageForTier` is (the configured SDK cannot load in Jest).
 */
export function pricingFromPackages(packages: any[]): Record<string, TierPricing> {
  const out: Record<string, TierPricing> = {};
  for (const p of packages) {
    const productId = String(p?.product?.identifier ?? '').toLowerCase();
    const priceString = typeof p?.product?.priceString === 'string' ? p.product.priceString : undefined;
    if (!priceString) continue;
    // Founding too, as a lifetime price: every card shows the store's own figure.
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
    const perMonth = period === 'annual' && typeof p?.product?.pricePerMonthString === 'string' && p.product.pricePerMonthString
      ? p.product.pricePerMonthString : undefined;
    out[tierId] = {
      ...out[tierId],
      [period]: priceString,
      ...(priceNum !== undefined ? { [`${period}Price`]: priceNum } : {}),
      ...(currencyCode ? { currencyCode: out[tierId]?.currencyCode ?? currencyCode } : {}),
      ...(perMonth ? { annualPerMonth: perMonth } : {}),
    };
  }
  return out;
}

export type BillingPeriod = 'monthly' | 'annual';

/**
 * The package to buy for a rank, matched on the STORE PRODUCT id and the
 * package type, never only the package id (RevenueCat's are `$rc_annual`,
 * with no rank in them). Most precise first: the exact `<rank>_<period>`; the
 * rank's product of that period; a custom package naming both; then, only
 * when no period was chosen, any product of the rank, and a package naming it.
 * A period chosen EXPLICITLY is strict: a member who chose monthly is never
 * sold annual; no match is null, and the caller says so. Founding is lifetime.
 */
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

/** Buy a rank by name; a `period` is honored strictly (see selectPackageForTier). */
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
 * A restore's answer, and whether the store answered AT ALL: "no subscription"
 * is only true when it did (not when it is unreachable or not configured).
 */
export interface RestoreResult extends EntitlementInfo {
  /** True only when the store actually answered. False means "we don't know". */
  storeReachable: boolean;
}

/** Restore Purchases, which Apple requires, for a reinstall or a new device. */
export async function restorePurchases(): Promise<RestoreResult> {
  if (!isConfigured || !Purchases) {
    // Not "you own nothing" — "we could not ask".
    logger.warn('[revenueCat] restorePurchases: SDK unavailable, cannot consult the store');
    return { ...parseEntitlements(null), storeReachable: false };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const entitlement = parseEntitlements(customerInfo);

    // Always, inactive too: the store ANSWERED (the server still guards other ranks).
    await syncEntitlementToSupabase(entitlement.tier);

    return { ...entitlement, storeReachable: true };
  } catch (e) {
    // The store threw: we learned nothing, so nothing is sent.
    logger.warn('[revenueCat] restorePurchases failed', e);
    return { ...parseEntitlements(null), storeReachable: false };
  }
}

/** A store here? (`purchaseTier`'s null is a cancel OR no store; one must speak.) */
export function isStoreReady(): boolean {
  return isConfigured && !!Purchases;
}

/**
 * Open the store's own "manage subscriptions" screen.
 *
 * The native sheet on iOS (Apple's, inside the app) and the Play subscriptions
 * page on Android — both are the store's, so they always show the member's
 * real subscriptions and the store's own cancel button. Returns false when the
 * SDK is not configured or the store refused; the caller then opens the
 * store's subscriptions address instead, so the control never does nothing.
 */
export async function showManageSubscriptions(): Promise<boolean> {
  if (!isConfigured || !Purchases) return false;
  try {
    await Purchases.showManageSubscriptions();
    return true;
  } catch (e) {
    logger.info('[revenueCat] showManageSubscriptions failed', e);
    return false;
  }
}

/**
 * Ask the server to grant what the store says: `sync-entitlement` reads
 * RevenueCat itself, server to server, and ignores the tier sent here.
 */
export async function syncEntitlementToSupabase(tier: ReelHouseTier): Promise<void> {
  try {
    // Whose rank this is, from the session on the phone: `getUser` asks the
    // network, so a purchase or restore with no signal queued nothing and the
    // new rank never reached the house. The queue is what carries it later.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // A founding seat is never lowered by a store: grant_entitlement refuses
    // any provider but 'manual' below auteur for a founding member, whatever
    // tier this sends (and sync-entitlement reads the store itself anyway).

    // Queued (a dropped network only delays it); `user_id` keeps it off the
    // WRONG account (see sync_entitlement in types/mutations.ts).
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
