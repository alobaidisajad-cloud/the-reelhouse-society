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

let Purchases: any = null;
let isConfigured = false;

/**
 * Initialize RevenueCat — call once in _layout.tsx after auth restore.
 * Safe to call even if the package isn't installed (graceful no-op).
 */
export async function initRevenueCat(userId?: string): Promise<void> {
  const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;

  if (!apiKey) {
    if (__DEV__) console.log('[RevenueCat] No API key configured — skipping');
    return;
  }

  try {
    // Dynamic import so the app doesn't crash if package isn't installed yet
    const RNPurchases = await import('react-native-purchases');
    Purchases = RNPurchases.default ?? RNPurchases;

    await Purchases.configure({ apiKey, appUserID: userId ?? null });
    isConfigured = true;

    if (__DEV__) console.log('[RevenueCat] Initialized successfully');
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] Failed to initialize:', err);
  }
}

export function parseEntitlements(customerInfo: any | null): EntitlementInfo {
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
 * Helper to purchase by tier name without needing the full package object
 */
export async function purchaseTier(tier: ReelHouseTier): Promise<EntitlementInfo | null> {
  if (!isConfigured || !Purchases) return null;
  try {
    const packages = await getOfferings();
    // Prioritize annual packages since the UI hardcodes annual pricing.
    let pkg = packages.find((p: any) => p.identifier.toLowerCase().includes(`${tier}_annual`));
    
    // Fallback if there is no annual specific tier (e.g., founding_lifetime or custom)
    if (!pkg) {
      pkg = packages.find((p: any) => p.identifier.toLowerCase().includes(tier));
    }
    
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
export async function restorePurchases(): Promise<EntitlementInfo> {
  if (!isConfigured || !Purchases) return parseEntitlements(null);

  try {
    // Atomic Parsing: extract entitlement directly from restore payload
    const customerInfo = await Purchases.restorePurchases();
    const entitlement = parseEntitlements(customerInfo);

    // Sync restored tier to Supabase
    // ALWAYS sync, even if inactive, to ensure downgrades are properly recorded
    await syncEntitlementToSupabase(entitlement.tier);

    return entitlement;
  } catch (e) {
    logger.warn('[revenueCat] restorePurchases failed', e);
    return parseEntitlements(null);
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
    enqueueMutation({ type: 'sync_entitlement', payload: { tier } });
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
