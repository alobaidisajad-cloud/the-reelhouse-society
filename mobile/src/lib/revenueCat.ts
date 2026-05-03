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

/**
 * Check current entitlements — returns the user's active tier.
 * Falls back to 'cinephile' (free) if no active subscription.
 */
export async function checkEntitlements(): Promise<EntitlementInfo> {
  const fallback: EntitlementInfo = {
    tier: 'cinephile',
    isActive: false,
    expiresAt: null,
    willRenew: false,
    productIdentifier: null,
  };

  if (!isConfigured || !Purchases) return fallback;

  try {
    const customerInfo = await Purchases.getCustomerInfo();
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
  } catch {
    return fallback;
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
  } catch {
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const entitlement = await checkEntitlements();

    // Sync tier to Supabase backend
    if (entitlement.isActive) {
      await syncEntitlementToSupabase(entitlement.tier);
    }

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
    // Default matching logic: try to find a package that contains the tier name (e.g. 'auteur_annual')
    const pkg = packages.find(p => p.identifier.toLowerCase().includes(tier));
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
  const fallback: EntitlementInfo = {
    tier: 'cinephile',
    isActive: false,
    expiresAt: null,
    willRenew: false,
    productIdentifier: null,
  };

  if (!isConfigured || !Purchases) return fallback;

  try {
    await Purchases.restorePurchases();
    const entitlement = await checkEntitlements();

    // Sync restored tier to Supabase
    if (entitlement.isActive) {
      await syncEntitlementToSupabase(entitlement.tier);
    }

    return entitlement;
  } catch {
    return fallback;
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

    await supabase
      .from('profiles')
      .update({ role: tier })
      .eq('id', user.id);
  } catch {
    // Silently fail — the entitlement is still valid client-side
    // Will retry on next app open
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
  } catch {
    // Non-critical — purchases still work without identification
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
  } catch {
    // Non-critical
  }
}
