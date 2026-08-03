import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform,
  useWindowDimensions, AppState
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useAuthStore } from '@/src/stores/auth';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';
import { ToastOverlay } from '@/src/components/ToastOverlay';
import { restorePurchases as restoreIAP, purchaseTier, ReelHouseTier, BillingPeriod } from '@/src/lib/revenueCat';
import { safeOpenURL } from '@/src/utils/linking';
import { supabase } from '@/src/lib/supabase';
import { resolveTier, getTierWeight } from '@/src/utils/tier';

// 10/10 A-02: Removed LayoutAnimation + UIManager.setLayoutAnimationEnabledExperimental
// Replaced with Reanimated LinearTransition on animated containers

import { TIERS } from '@/src/constants/membership';
import { useMembershipPricing } from '@/src/hooks/useMembershipPricing';

/**
 * Formats the honest "≈ X / MO" equivalence under annual billing from the
 * store's own numeric price + currency. Returns null on any failure — the UI
 * then omits the line entirely rather than ever showing a wrong number.
 */
function fmtPerMonth(annualPrice?: number, currencyCode?: string): string | null {
  if (typeof annualPrice !== 'number' || !isFinite(annualPrice) || annualPrice <= 0) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(annualPrice / 12);
  } catch {
    return null;
  }
}

export default function MembershipScreen() {

  const insets = useSafeAreaInsets();
  const { user, isAuthenticated } = useAuthStore();
  const pricing = useMembershipPricing(); // CONST-3: live store prices (falls back to static)
  const [isRedirecting, setIsRedirecting] = useState(false);

  // ── Billing choice: monthly or annual, the member's call ──────────────
  // Annual is the default (best value, wears the SAVE 16% stamp). If live
  // pricing resolves and NO tier carries a monthly product, the toggle hides
  // itself and the register runs annual-only — a member can never pick a
  // period the store can't honestly sell (see selectPackageForTier's strict
  // mode for the second half of that guarantee).
  const [billing, setBilling] = useState<BillingPeriod>('annual');
  // ── Founding seat cap (declared here so the AppState effect below can refresh it) ──
  const [foundingCount, setFoundingCount] = useState<number | null>(null);
  const monthlyKnownAbsent =
    Object.keys(pricing).length > 0 &&
    !Object.values(pricing).some((p) => !!p?.monthly);
  useEffect(() => {
    if (monthlyKnownAbsent && billing === 'monthly') setBilling('annual');
  }, [monthlyKnownAbsent, billing]);

  // ── #98: the Founding seat's REAL store price ──────────────────────────────
  // The card rendered a "$" and a "49" typed straight into the screen while the tier
  // cards beside it showed live localized prices — so a member in the UK or Japan saw
  // two real prices and one US dollar figure. Wrong, and an App Store metadata risk.
  // getTierPricing now resolves the lifetime product too; the static copy remains the
  // fallback for when the store cannot be reached, so the card is never blank.
  //
  // Adding 'founding' to `pricing` cannot disturb monthlyKnownAbsent above: that uses
  // .some(), which needs only ONE tier to carry a monthly product, and a lifetime seat
  // never carries one.
  const foundingPriceLabel = pricing.founding?.lifetime;
  const foundingSeatPrice = pricing.founding?.lifetimePrice;
  // Compare against AUTEUR, because that is precisely what the seat grants — Auteur
  // access for life. The shipped copy quotes "$19.99/yr", which matches no tier the
  // app sells, so it is kept ONLY as the offline fallback rather than propagated.
  const compareAnnualLabel = pricing.auteur?.annual;
  const compareAnnualPrice = pricing.auteur?.annualPrice;
  // Only make the payback claim when BOTH real numbers are known. Deriving "pays for
  // itself in under N years" from one live price and one hardcoded one would state a
  // number that is simply false in any store where the prices differ.
  const paybackYears =
    foundingSeatPrice && compareAnnualPrice && compareAnnualPrice > 0
      ? Math.ceil(foundingSeatPrice / compareAnnualPrice)
      : null;
  const foundingCompareLine =
    compareAnnualLabel && paybackYears
      // "in under 1 years" is what naive pluralisation produces here, and a seat priced
      // near one year of Auteur makes that the LIKELIEST branch, not an edge case.
      ? `Compare to ${compareAnnualLabel}/yr recurring — this pays for itself ${
          paybackYears <= 1 ? 'within the first year' : `in under ${paybackYears} years`
        } and never charges again.`
      : 'Compare to $19.99/yr recurring — this pays for itself in under 3 years and never charges again.';
  const scrollRef = useRef<ScrollView>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  // Synchronous mutex prevents concurrent purchases.
  // React state batching makes useState unreliable as a concurrency guard —
  // two rapid taps can both read isRedirecting=false before either setState fires.
  const purchaseMutex = useRef(false);
  const hasSnappedRef = useRef(false);

  const lastCheckoutRef = useRef<number>(0);

  // P7-FIX #5: Refresh session tier when returning from external payment browser.
  // Also re-fetch the founding seat count on the same signal, so the certificate
  // retires itself for someone who left the app open while seat 100 sold —
  // without needing a revisit.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Defer to background polling loop if a checkout recently occurred
        if (Date.now() - lastCheckoutRef.current > 10000) {
          useAuthStore.getState().restoreSession?.();
        }
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('is_founding', true)
          .then(({ count, error }) => {
            if (!error && count !== null) setFoundingCount(count);
          });
      }
    });
    return () => sub.remove();
  }, []);

  const { width } = useWindowDimensions();
  const cardWidth = width * 0.78;
  const cardGap = 12;

  // ── Founding seat cap ─────────────────────────────────────────
  // Fetch once on mount. profiles RLS allows SELECT for everyone,
  // so a head-only count query works without an RPC.
  useEffect(() => {
    let mounted = true;
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_founding', true)
        .then(({ count, error }) => {
        if (mounted && !error && count !== null) setFoundingCount(count);
      });
    return () => { mounted = false; };
  }, []);

  const userRole = resolveTier(user);

  // Tier hierarchy for CTA logic — prevents dead-end buttons and accidental downgrades.
  // An Auteur user must see "INCLUDED IN YOUR RANK" on lower-tier cards, not upgrade CTAs.
  const TIER_RANK: Record<string, number> = { free: 0, cinephile: 0, archivist: 1, auteur: 2, founding: 3 };
  const userRank = TIER_RANK[userRole] ?? 0;

  const isCurrentTier = (tierId: string) => {
    if (tierId === 'cinephile') return userRank === 0;
    if (tierId === 'auteur' && userRole === 'founding') return true;
    return userRole === tierId;
  };

  /** True when the user's rank is strictly above this tier — they already have these features. */
  const isLowerTier = (tierId: string) => userRank > (TIER_RANK[tierId] ?? 0);

  const handleCheckout = async (tier: string) => {
    if (!isAuthenticated || !user) {
      nav.push('/login');
      return;
    }
    // Synchronous mutex guard
    if (purchaseMutex.current) return;
    purchaseMutex.current = true;
    TactileEngine.mutate();
    setIsRedirecting(true);
    try {
      // The member's explicit billing choice rides through to a STRICT package
      // match — a monthly pick can never silently charge the annual price.
      const entitlement = await purchaseTier(tier as ReelHouseTier, billing);
      if (entitlement?.isActive) {
        lastCheckoutRef.current = Date.now();
        reelToast.success(`Welcome to the ${tier.toUpperCase()} rank!`);
        useAuthStore.getState().setLocalTierHint({ tier: entitlement.tier });
        
        // Global Unlock Polling Architecture
        (async () => {
          try {
            const userId = useAuthStore.getState().user?.id;
            for (let i = 0; i < 4; i++) {
              await new Promise(r => setTimeout(r, 2500));
              if (!userId) break;
              const { data } = await supabase.from('profiles').select('tier, role, is_founding').eq('id', userId).single();
              if (data && getTierWeight(resolveTier(data)) >= getTierWeight(entitlement.tier)) {
                await supabase.auth.refreshSession();
                await useAuthStore.getState().restoreSession?.();
                break;
              }
            }
          } catch {
            // Background polling failed, ignore
          }
        })();
      }
    } catch (err) {
      const msg = err instanceof Error && err.message.includes('No package found')
        ? (billing === 'monthly'
            ? 'Monthly plans are being set up. Please try the annual plan.'
            : 'Subscriptions are being set up. Please try again shortly.')
        : 'Checkout unavailable. Please check your App Store account.';
      reelToast.error(msg);
    } finally {
      setIsRedirecting(false);
      purchaseMutex.current = false;
    }
  };

  const handleFoundingCheckout = async () => {
    if (!isAuthenticated || !user) { nav.push('/login'); return; }
    // Synchronous mutex guard
    if (purchaseMutex.current) return;
    purchaseMutex.current = true;
    
    try {
      // Concurrency Guard: Re-verify the count right before purchase
      const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_founding', true);
      if (error) {
        reelToast.error('Unable to verify Founding Member availability. Try again.');
        return;
      }
      if (count !== null && count >= 100) {
        reelToast.error('The 100 Founding Member seats have been filled.');
        setFoundingCount(count);
        return;
      }

      TactileEngine.destroy();
      setIsRedirecting(true);
      
      const entitlement = await purchaseTier('founding');
      if (entitlement?.isActive) {
        lastCheckoutRef.current = Date.now();
        reelToast.success('Welcome to the Founding Board!');
        useAuthStore.getState().setLocalTierHint({ tier: entitlement.tier, is_founding: entitlement.tier === 'founding' || undefined });

        // Global Unlock Polling Architecture
        //
        // ⚠️ finding 100 — this waits for the SEAT (is_founding), not for the founding tier.
        //
        // The 100-seat cap is enforced atomically server-side by claim_founding_seat, and
        // RevenueCat has already charged by the time it runs. If the last seat goes while
        // this purchase is in flight, the member is granted the Auteur rank WITHOUT the
        // seat — the server reports that as seatClaimed=false and the app used to throw
        // the whole reply away, so someone who paid for a seat that no longer existed was
        // never told and believed they were a founding member.
        //
        // The old condition made it worse: it waited for a weight >= founding, which in
        // exactly that case NEVER arrives, so the loop ran out and the member's session
        // was never refreshed either. Waiting on the seat and handling its absence
        // explicitly fixes both.
        (async () => {
          try {
            const userId = useAuthStore.getState().user?.id;
            let last: { tier: string | null; role: string | null; is_founding: boolean | null } | null = null;
            for (let i = 0; i < 4; i++) {
              await new Promise(r => setTimeout(r, 2500));
              if (!userId) break;
              const { data } = await supabase.from('profiles').select('tier, role, is_founding').eq('id', userId).single();
              last = data ?? last;
              if (data?.is_founding === true) {
                await supabase.auth.refreshSession();
                await useAuthStore.getState().restoreSession?.();
                return;   // seat secured — nothing to explain
              }
            }
            // The seat never landed inside the window. Telling someone their seat was
            // taken is alarming and irreversible-feeling, so it needs POSITIVE evidence
            // — not the absence of evidence.
            //
            // "The rank arrived, so they must have been capped out" is NOT evidence: an
            // existing AUTEUR already had the rank before they bought, so a merely slow
            // webhook would look identical and they would be told the seat was taken
            // when it was not. Ask the cap directly instead.
            if (last?.is_founding !== true) {
              const { count } = await supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('is_founding', true);

              if (count !== null && count >= 100) {
                // The seats really are gone. Retire the certificate on screen too.
                setFoundingCount(count);
                await supabase.auth.refreshSession();
                await useAuthStore.getState().restoreSession?.();
                reelToast.info('The final Founding seat was claimed just before your purchase. You have been granted the Auteur rank — please contact support about your seat.');
              }
              // Seats still available -> the webhook is simply slow. Stay quiet: the
              // optimistic tier hint is already applied and the next session restore
              // reconciles it. Never invent bad news from a timeout.
            }
          } catch {
            // Background polling failed, ignore
          }
        })();
      }
    } catch (err) {
      const msg = err instanceof Error && err.message.includes('No package found')
        ? 'Subscriptions are being set up. Please try again shortly.'
        : 'Checkout unavailable. Please check your App Store account.';
      reelToast.error(msg);
    } finally {
      setIsRedirecting(false);
      purchaseMutex.current = false;
    }
  };

  return (
    <View style={st.container}>
      <ToastOverlay />
      {/* Nav */}
      <View style={[st.navBar, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={() => nav.back()} style={st.navBackBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light" accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={22} color={colors.bone} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={[st.scrollContent, { paddingBottom: Math.max(insets.bottom, 80) }]} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <Animated.View entering={FadeInDown.duration(700)} style={st.header}>
          <Text style={st.headerLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>✦&nbsp; ELEVATE YOUR DEVOTION &nbsp;✦</Text>
          <Text style={st.headerTitle}>The ReelHouse{'\n'}Society</Text>
          <Text style={st.headerSub}>
            Ascend the ranks of The Society. Embrace the aesthetic. Wield the ultimate cinematic toolkit.
          </Text>
        </Animated.View>

        {/* ── Billing choice — the member's call, annual wears the savings ── */}
        {!monthlyKnownAbsent && (
          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={st.billingToggleWrap}>
            <View style={st.billingToggle}>
              {(['monthly', 'annual'] as const).map((p) => {
                const active = billing === p;
                return (
                  <PressableScale
                    key={p}
                    style={[st.billingSeg, active && st.billingSegActive]}
                    onPress={() => { if (billing !== p) { TactileEngine.selection(); setBilling(p); } }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    haptic="selection"
                    pressedScale={0.97}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={p === 'monthly' ? 'Pay monthly' : 'Pay annually, save 16 percent'}
                  >
                    <Text style={[st.billingSegText, active && st.billingSegTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {p === 'monthly' ? 'MONTHLY' : 'ANNUAL'}
                    </Text>
                    {p === 'annual' && (
                      <Text style={[st.billingSave, active && st.billingSaveActive]} numberOfLines={1}>SAVE 16%</Text>
                    )}
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ── Tiers Carousel (horizontal scroll like web mobile) ── */}
        <Animated.View entering={FadeInDown.duration(600).delay(150)}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled={false}
            decelerationRate="fast"
            snapToInterval={cardWidth + cardGap}
            snapToAlignment="center"
            disableIntervalMomentum={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[st.tiersScroll, { paddingHorizontal: (width - cardWidth) / 2, gap: cardGap }]}
            contentOffset={Platform.OS === 'ios' ? { x: cardWidth + cardGap, y: 0 } : undefined}
            onLayout={Platform.OS === 'android' ? () => {
              if (!hasSnappedRef.current) {
                hasSnappedRef.current = true;
                setTimeout(() => {
                  scrollRef.current?.scrollTo({ x: cardWidth + cardGap, animated: false });
                }, 0);
              }
            } : undefined}
          >
            {TIERS.map((tier, idx) => (
              <View key={tier.id} style={[st.tierCardOuter, { width: cardWidth }, tier.popular && st.tierCardOuterPopular]}>
                {/* Popular badge — outside clippped card */}
                {tier.popular && (
                  <View style={st.popularBadgeWrap}>
                    <View style={st.popularBadge}>
                      <LinearGradient colors={[colors.sepia, '#b89530']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                      <Text style={st.popularBadgeText}>MOST POPULAR</Text>
                    </View>
                  </View>
                )}
                <View style={[st.tierCard, { borderColor: tier.borderColor }]}>
                <LinearGradient colors={[...tier.bgGradient]} style={StyleSheet.absoluteFillObject} />

                {/* Bottom accent line */}
                {tier.id !== 'cinephile' && (
                  <LinearGradient
                    colors={['transparent', tier.accentColor, 'transparent']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={st.tierAccentLine}
                  />
                )}

                {/* Tier Name */}
                <Text style={[st.tierName, tier.id === 'auteur' && st.tierNameAuteur]}>{tier.name}</Text>
                <Text style={[st.tierLabel, { color: tier.labelColor, opacity: tier.id === 'cinephile' ? 0.6 : 1 }]}>{tier.label}</Text>

                {/* Price — honest per billing mode: the big number is what the
                    store will actually charge for the selected period, with the
                    ≈/MO equivalence + renewal terms beneath. Live localized
                    prices preferred; static copy as fallback. */}
                {tier.price === 'Free' ? (
                  <View style={st.tierPriceWrap}>
                    <Text style={[st.priceAmount, st.priceAmountFree]}>Free</Text>
                    <Text style={st.pricePeriod}>{tier.pricePeriod}</Text>
                  </View>
                ) : (() => {
                  const rc = pricing[tier.id];
                  const isMonthly = billing === 'monthly';
                  const livePrice = isMonthly ? rc?.monthly : rc?.annual;
                  const staticPrice = isMonthly ? tier.priceMonthly : tier.priceAnnual;
                  // Annual mode carries the truthful per-month equivalence —
                  // from the store's own numbers when available, static otherwise.
                  const equivLive = !isMonthly ? fmtPerMonth(rc?.annualPrice, rc?.currencyCode) : null;
                  const equiv = !isMonthly ? (equivLive ?? (tier.annualEquiv ? `$${tier.annualEquiv}` : null)) : null;
                  const renewal = isMonthly ? 'AUTO-RENEWS MONTHLY · CANCEL ANYTIME' : 'AUTO-RENEWS YEARLY · CANCEL ANYTIME';
                  const billingLine = equiv ? `≈ ${equiv} / MO · ${renewal}` : renewal;
                  return (
                    <>
                      <View style={st.tierPriceWrap}>
                        {livePrice ? (
                          // priceString already includes the localized currency symbol.
                          <Text style={st.priceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{livePrice}</Text>
                        ) : (
                          <>
                            <Text style={st.priceCurrency}>$</Text>
                            <Text style={st.priceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{staticPrice}</Text>
                          </>
                        )}
                        <Text style={st.pricePeriod}>{isMonthly ? '/ MO' : '/ YR'}</Text>
                      </View>
                      <Text style={st.priceBilling} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{billingLine}</Text>
                    </>
                  );
                })()}

                {/* Features */}
                <View style={st.featuresWrap}>
                  {tier.includes && (
                    <Text style={[st.tierIncludes, { color: tier.accentColor }]}>{tier.includes}</Text>
                  )}

                  {tier.featuredFeature && (
                    <View style={[st.featuredBox, { borderColor: tier.id === 'auteur' ? colors.crimsonBorder : 'rgba(184,137,26,0.18)' }]}>
                      <View style={[st.featureDot, { backgroundColor: tier.dotColor, marginTop: 5 }]} />
                      <View style={st.featuredBoxFlex}>
                        <Text style={[st.featuredTitle, tier.id === 'auteur' && st.featuredTitleAuteur]}>{tier.featuredFeature.title}</Text>
                        <Text style={st.featuredDesc}>{tier.featuredFeature.desc}</Text>
                      </View>
                    </View>
                  )}

                  {tier.features.map((feature, i) => (
                    <View key={i} style={st.featureRow}>
                      {tier.id === 'auteur' ? (
                        <Text style={st.auteurStarDot}>{'\u2605'}</Text>
                      ) : (
                        <View style={[st.featureDot, { backgroundColor: tier.dotColor, opacity: tier.id === 'cinephile' ? 0.5 : 1 }]} />
                      )}
                      <Text style={[st.featureText, tier.id === 'cinephile' && { opacity: 0.7 }]}>{feature}</Text>
                    </View>
                  ))}
                </View>

                {/* CTA — Three states: current rank, included (lower tier), upgrade */}
                {isAuthenticated && isCurrentTier(tier.id) ? (
                  <View style={[st.currentRankBox, { borderColor: tier.id === 'auteur' ? colors.crimson : tier.id === 'archivist' ? colors.sepia : 'rgba(184,137,26,0.3)' }]}>
                    <Text style={[st.currentRankText, { color: tier.id === 'auteur' ? colors.crimson : colors.sepia }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {tier.id === 'auteur' ? '\u2605 YOUR CURRENT RANK \u2605' : tier.id === 'archivist' ? '\u2726 YOUR CURRENT RANK \u2726' : 'YOUR CURRENT RANK'}
                    </Text>
                  </View>
                ) : isAuthenticated && isLowerTier(tier.id) ? (
                  <View style={[st.currentRankBox, { borderColor: 'rgba(184,137,26,0.15)' }]}>
                    <Text style={[st.currentRankText, { color: colors.fog, opacity: 0.6 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>INCLUDED IN YOUR RANK</Text>
                  </View>
                ) : (
                  <PressableScale
                    style={[
                      st.tierCta,
                      tier.ctaStyle === 'ghost' && st.tierCtaGhost,
                      tier.ctaStyle === 'primary' && st.tierCtaPrimary,
                      tier.ctaStyle === 'auteur' && st.tierCtaAuteur,
                    ]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    disabled={isRedirecting || isRestoring}
                    onPress={() => {
                      if (tier.id === 'cinephile') {
                        if (!isAuthenticated) nav.push('/login');
                      } else {
                        handleCheckout(tier.id);
                      }
                    }}
                    pressedScale={0.97}
                    accessibilityRole="button"
                    accessibilityLabel={isRedirecting ? 'Processing purchase' : tier.cta}
                  >
                    {tier.ctaStyle === 'auteur' && (
                      <LinearGradient colors={[colors.bloodReel, colors.crimson]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
                    )}
                    <Text
                      style={[
                        st.tierCtaText,
                        tier.ctaStyle === 'ghost' && { color: colors.fog },
                        tier.ctaStyle === 'auteur' && { color: colors.parchment },
                      ]}
                      numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
                    >
                      {isRedirecting ? 'PROCESSING…' : tier.cta}
                    </Text>
                  </PressableScale>
                )}
                </View>
              </View>
            ))}
          </ScrollView>
        </Animated.View>
        {/* ── Founding Members Banner (Victory State or Checkout) ── */}
        {userRole === 'founding' ? (
          <Animated.View entering={FadeInDown.duration(600).delay(300)} style={[st.foundingBanner, { borderColor: colors.sepia }]}>
            <View style={[st.bracket, st.bracketTL]} />
            <View style={[st.bracket, st.bracketTR]} />
            <View style={[st.bracket, st.bracketBL]} />
            <View style={[st.bracket, st.bracketBR]} />
            <View style={st.foundingSeal}>
              <Text style={st.foundingSealStar}>★</Text>
            </View>
            <Text style={st.foundingTag} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>FOUNDING MEMBER</Text>
            <Text style={st.foundingTitle}>Seat Secured</Text>
            <Text style={st.foundingDesc}>
              You are one of the original 100. Your Auteur access is permanent. The ledger is sealed.
            </Text>
          </Animated.View>
        ) : (foundingCount !== null && foundingCount < 100) && (
          <Animated.View entering={FadeInDown.duration(600).delay(300)} style={st.foundingBanner}>
            {/* Certificate corner brackets — a pinned document for the first 100.
                Self-retiring: this banner renders only while seats remain. */}
            <View style={[st.bracket, st.bracketTL]} />
            <View style={[st.bracket, st.bracketTR]} />
            <View style={[st.bracket, st.bracketBL]} />
            <View style={[st.bracket, st.bracketBR]} />
  
            <View style={st.foundingSeal}>
              <Text style={st.foundingSealStar}>★</Text>
            </View>
            <Text style={st.foundingTag} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>LIMITED OFFER {'\u00B7'} {100 - foundingCount} {100 - foundingCount === 1 ? 'SEAT' : 'SEATS'} REMAINING</Text>
            <Text style={st.foundingTitle}>Founding Members</Text>
            <Text style={st.foundingDesc}>
              The first 100 members to join The Society receive{' '}
              <Text style={st.foundingDescHighlight}>Auteur access for life</Text>
              {' '}{'\u2014'} permanently, with no recurring charges, ever. A single entry in the ledger. A permanent seat in the house.
            </Text>
  
            <View style={st.foundingPriceRow}>
              {foundingPriceLabel ? (
                // A localized price is one indivisible string \u2014 "\u00a339.99", "\u00a55,800",
                // "1 200 kr" \u2014 so it CANNOT be split into the symbol/amount pair the
                // static layout uses. Render it whole and let it shrink to fit.
                <Text style={st.foundingAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                  {foundingPriceLabel}
                </Text>
              ) : (
                <>
                  <Text style={st.foundingCurrency}>$</Text>
                  <Text style={st.foundingAmount}>49</Text>
                </>
              )}
              <View>
                <Text style={st.foundingPriceLabel}>ONE TIME</Text>
                <Text style={st.foundingPriceSub}>NO RENEWALS</Text>
              </View>
            </View>

            <Text style={st.foundingCompare}>{foundingCompareLine}</Text>
  
            <PressableScale style={st.foundingBtn} disabled={isRedirecting || isRestoring} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={handleFoundingCheckout} pressedScale={0.97} accessibilityRole="button" accessibilityLabel={isRedirecting ? 'Processing purchase' : 'Claim a founding seat'}>
              <LinearGradient colors={[colors.sepia, '#b89530']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
              <Text style={st.foundingBtnText}>{isRedirecting ? 'PROCESSING\u2026' : 'CLAIM A FOUNDING SEAT'}</Text>
            </PressableScale>
  
            <Text style={st.foundingFooter}>IN-APP PURCHASE {'\u00B7'} SECURE CHECKOUT {'\u00B7'} SEATS FILLING FAST</Text>
          </Animated.View>
        )}

        {/* ── Philosophy Section ── */}
        <Animated.View entering={FadeInDown.duration(600).delay(400)} style={st.philosophySection}>
          <Text style={st.philosophyLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>OUR PHILOSOPHY</Text>
          <Text style={st.philosophyTitle}>Built for the Love{'\n'}of Cinema.</Text>
          <Text style={st.philosophyBody}>
            Ascension here means one thing: depth.{'\n\n'}Every rank opens another door {'\u2014'} finer tools for your critiques, a grander home for your archive, a closer seat to the screen.{'\n\n'}The ranks are not upgrades. They are rooms of the house.
          </Text>
          <View style={st.philosophyDivider}>
            <View style={st.philosophyLine} />
            <Text style={st.philosophyFlicker}>{'\u2605'}</Text>
            <View style={st.philosophyLine} />
          </View>
        </Animated.View>

        {/* ── Restore Purchases & Manage Subscription (Apple Requirement) ── */}
        <Animated.View entering={FadeInDown.duration(600).delay(500)} layout={LinearTransition} style={st.restoreSection}>
          <PressableScale
            style={st.restoreBtn}
            disabled={isRestoring || isRedirecting}
            onPress={async () => {
              if (purchaseMutex.current) return;
              purchaseMutex.current = true;
              setIsRestoring(true);
              TactileEngine.navigate();
              try {
                const result = await restoreIAP();
                const authStore = useAuthStore.getState();

                if (!result.storeReachable) {
                  // #99 — the store could not be consulted. That is NOT "you have no
                  // subscription", and it used to be treated as though it were: a paying
                  // member on bad signal was told they had nothing and had their tier
                  // stripped locally, closing every premium feature until a good session
                  // restored it. Say what actually happened and change nothing.
                  reelToast.error("Couldn't reach the App Store — your membership is unchanged.");
                  return;
                }

                if (result.isActive) {
                  // finding 101 — setLocalTierHint, NOT updateUser. `tier` is server-derived and
                  // absent from ProfileService's allow-list, so updateUser pays for a
                  // network round trip that cannot write it (stores/auth.ts:411-418), is
                  // silently dropped by its own 1.5s throttle if anything else touched the
                  // profile, and on failure shows "Profile update failed — changes
                  // reverted" immediately after a SUCCESSFUL restore.
                  authStore.setLocalTierHint({
                    tier: result.tier,
                    is_founding: result.tier === 'founding' || undefined,
                  });
                  reelToast.success(`Restored: ${result.tier.toUpperCase()} tier`);
                } else {
                  // The store answered and reported nothing active. restorePurchases has
                  // already sent that downgrade to the server, where grant_entitlement
                  // decides whether it is allowed — it refuses to lower a tier bought on
                  // the website or granted by hand. So ask the server for the truth
                  // instead of guessing locally, which is what used to demote web buyers.
                  await authStore.restoreSession?.();
                  reelToast.info('No active subscriptions found.');
                }
              } catch {
                reelToast.error('Restore failed. Please try again.');
              } finally {
                setIsRestoring(false);
                purchaseMutex.current = false;
              }
            }}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel={isRestoring ? 'Restoring purchases' : 'Restore purchases'}
          >
            <Text style={st.restoreBtnText}>{isRestoring ? 'RESTORING…' : 'RESTORE PURCHASES'}</Text>
          </PressableScale>

          {Platform.OS === 'ios' && (
            <PressableScale
              style={st.manageBtn}
              onPress={() => safeOpenURL('https://apps.apple.com/account/subscriptions')}
              haptic="light"
              accessibilityRole="link"
              accessibilityLabel="Manage subscription in App Store"
            >
              <Text style={st.manageBtnText}>MANAGE SUBSCRIPTION</Text>
            </PressableScale>
          )}
          {Platform.OS === 'android' && (
            <PressableScale
              style={st.manageBtn}
              onPress={() => safeOpenURL('https://play.google.com/store/account/subscriptions')}
              haptic="light"
              accessibilityRole="link"
              accessibilityLabel="Manage subscription in Google Play"
            >
              <Text style={st.manageBtnText}>MANAGE SUBSCRIPTION</Text>
            </PressableScale>
          )}
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  scrollContent: { paddingBottom: 80 },
  navBar: {
    paddingHorizontal: 16, paddingBottom: 8,
    zIndex: 10,
  },
  navBackBtn: { width: 40, height: 40, justifyContent: 'center' },

  // ── Header ──
  header: { alignItems: 'center', paddingHorizontal: 24, marginTop: 8, marginBottom: 24 },
  headerLabel: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 4,
    color: colors.sepia, marginBottom: 12,
    textShadowColor: 'rgba(184,137,26,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
  },
  headerTitle: {
    fontFamily: fonts.display, fontSize: 36, color: colors.parchment,
    textAlign: 'center', lineHeight: 40,
    textShadowColor: 'rgba(184,137,26,0.15)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 40,
  },
  headerSub: {
    fontFamily: fonts.body, fontSize: 14, color: colors.bone,
    textAlign: 'center', lineHeight: 22, marginTop: 16,
    paddingHorizontal: 16, opacity: 0.85,
  },

  // ── Billing Toggle — the member's monthly/annual choice ──
  billingToggleWrap: { alignItems: 'center', marginBottom: 4 },
  billingToggle: {
    flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(184,137,26,0.35)',
    borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(10,7,3,0.8)',
  },
  billingSeg: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 18, minWidth: 118,
  },
  billingSegActive: { backgroundColor: colors.sepia },
  billingSegText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog, includeFontPadding: false },
  billingSegTextActive: { color: colors.ink },
  billingSave: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1, color: colors.flicker, includeFontPadding: false },
  billingSaveActive: { color: colors.ink, opacity: 0.85 },

  // ── Tiers Carousel ──
  tiersScroll: { paddingVertical: 20 },

  tierCard: {
    borderWidth: 1, borderRadius: 3, overflow: 'hidden',
    padding: 24, paddingTop: 28,
  },
  tierAccentLine: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, opacity: 0.5,
  },

  // Popular badge
  popularBadgeWrap: {
    position: 'absolute', top: -12, left: 0, right: 0, zIndex: 5,
    alignItems: 'center',
  },
  popularBadge: {
    borderRadius: 2, paddingHorizontal: 14, paddingVertical: 5, overflow: 'hidden',
  },
  popularBadgeText: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.5,
    color: colors.ink, zIndex: 1,
  },

  // Tier name & label
  tierName: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, lineHeight: 28, marginBottom: 4 },
  tierNameAuteur: { color: colors.crimson },
  tierCardOuter: { },
  tierCardOuterPopular: { paddingTop: 12 },
  tierLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, marginBottom: 18 },

  // Price
  tierPriceWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginBottom: 4 },
  priceCurrency: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment, opacity: 0.7 },
  priceAmount: { fontFamily: fonts.display, fontSize: 42, color: colors.parchment, lineHeight: 44 },
  priceAmountFree: { fontSize: 32, color: colors.bone, opacity: 0.8 },
  pricePeriod: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, letterSpacing: 1, marginLeft: 2 },
  priceBilling: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, letterSpacing: 1, opacity: 0.6, marginBottom: 18 },

  // Features
  featuresWrap: { flex: 1, gap: 10, marginBottom: 20, marginTop: 4 },
  tierIncludes: { fontFamily: fonts.sub, fontSize: 12, fontStyle: 'italic', marginBottom: 2, opacity: 0.9 },

  featuredBox: {
    padding: 12, borderWidth: 1, borderRadius: 3,
    backgroundColor: 'rgba(20,16,10,0.95)', flexDirection: 'row', gap: 8,
    alignItems: 'flex-start', marginBottom: 4,
  },
  featuredTitle: { fontFamily: fonts.sub, fontSize: 13, color: colors.parchment, lineHeight: 17, marginBottom: 4 },
  featuredTitleAuteur: { color: colors.crimson },
  featuredBoxFlex: { flex: 1 },
  auteurStarDot: { fontSize: 8, color: colors.crimson, marginTop: 3 },
  foundingSealStar: { fontSize: 18, color: colors.sepia },
  foundingDescHighlight: { fontStyle: 'italic', color: colors.parchment },
  philosophyFlicker: { fontSize: 12, color: colors.flicker },
  featuredDesc: { fontFamily: fonts.sub, fontSize: 11, color: colors.bone, lineHeight: 16, opacity: 0.8 },

  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featureDot: { width: 3, height: 3, borderRadius: 1.5, marginTop: 6, flexShrink: 0 },
  featureText: { fontFamily: fonts.sub, fontSize: 12, color: colors.bone, lineHeight: 17, opacity: 0.9, flex: 1 },

  // Current Rank
  currentRankBox: {
    borderWidth: 1, borderRadius: 3, paddingVertical: 14,
    backgroundColor: 'rgba(184,137,26,0.05)', alignItems: 'center',
  },
  currentRankText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5 },

  // CTA Buttons
  tierCta: {
    borderRadius: 3, paddingVertical: 14, alignItems: 'center',
    overflow: 'hidden',
  },
  tierCtaGhost: { borderWidth: 1, borderColor: colors.ash },
  tierCtaPrimary: { backgroundColor: colors.sepia },
  tierCtaAuteur: { },
  tierCtaText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, zIndex: 1 },

  // ── Founding Banner ──
  foundingBanner: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 32,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.35)', borderRadius: 3,
    padding: 28, alignItems: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(184,137,26,0.03)',
  },
  // Certificate corner brackets — the founding banner is a pinned document.
  bracket: { position: 'absolute', width: 16, height: 16, borderColor: 'rgba(184,137,26,0.6)' },
  bracketTL: { top: 6, left: 6, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  bracketTR: { top: 6, right: 6, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  bracketBL: { bottom: 6, left: 6, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  bracketBR: { bottom: 6, right: 6, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  foundingSeal: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1.5, borderColor: colors.sepia,
    backgroundColor: 'rgba(184,137,26,0.08)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  foundingTag: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 4,
    color: colors.sepia, marginBottom: 8,
    textShadowColor: 'rgba(184,137,26,0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
  },
  foundingTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, marginBottom: 12, lineHeight: 32 },
  foundingDesc: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    textAlign: 'center', lineHeight: 21, marginBottom: 20,
    paddingHorizontal: 8, opacity: 0.9,
  },
  foundingPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 6 },
  foundingCurrency: { fontFamily: fonts.sub, fontSize: 14, color: colors.sepia },
  foundingAmount: {
    fontFamily: fonts.display, fontSize: 40, color: colors.flicker, lineHeight: 42,
    textShadowColor: 'rgba(184,137,26,0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 30,
  },
  foundingPriceLabel: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, letterSpacing: 1 },
  foundingPriceSub: { fontFamily: fonts.sub, fontSize: 7, color: colors.sepia, letterSpacing: 1.2 },
  foundingCompare: {
    fontFamily: fonts.sub, fontSize: 11, color: colors.fog,
    fontStyle: 'italic', textAlign: 'center', marginBottom: 20,
    paddingHorizontal: 12, opacity: 0.8, lineHeight: 17,
  },
  foundingBtn: {
    borderRadius: 3, paddingVertical: 14, paddingHorizontal: 28,
    overflow: 'hidden', alignItems: 'center',
  },
  foundingBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.ink, zIndex: 1 },
  foundingFooter: {
    fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.5,
    color: colors.fog, marginTop: 16, opacity: 0.6,
  },

  // ── Philosophy Section ──
  philosophySection: {
    alignItems: 'center', paddingHorizontal: 24,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.15)',
    paddingTop: 32, marginHorizontal: 16,
  },
  philosophyLabel: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 4,
    color: colors.sepia, marginBottom: 14,
    textShadowColor: 'rgba(184,137,26,0.2)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15,
  },
  philosophyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, textAlign: 'center', marginBottom: 14, lineHeight: 30 },
  philosophyBody: {
    fontFamily: fonts.body, fontSize: 13, color: colors.bone,
    textAlign: 'center', lineHeight: 22, fontStyle: 'italic',
    opacity: 0.85, marginBottom: 24,
  },
  philosophyDivider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  philosophyLine: { width: 40, height: 1, backgroundColor: colors.flicker, opacity: 0.5 },

  // ── Restore & Manage ──
  restoreSection: {
    alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.08)',
    marginHorizontal: 16, marginTop: 8,
  },
  restoreBtn: {
    paddingVertical: 12, paddingHorizontal: 28,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.25)', borderRadius: 3,
    marginBottom: 12,
  },
  restoreBtnText: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2,
    color: colors.sepia, textAlign: 'center',
  },
  manageBtn: {
    paddingVertical: 8, paddingHorizontal: 20,
  },
  manageBtnText: {
    fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5,
    color: colors.fog, textDecorationLine: 'underline', opacity: 0.7,
  },
});
