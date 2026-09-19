/**
 * The Society — where a rank is chosen and bought.
 * ─────────────────────────────────────────────────────────────────────────────
 * A 1924 bill posted in the lobby, then a box office: the ranks as admission
 * tickets stacked top to bottom (never a carousel — a member cannot compare
 * what they cannot see), the free seat, a ledger of every privilege, the
 * founding certificate while seats remain, the small print the stores require,
 * and one docked window that buys the chosen ticket.
 *
 * Everything it says is read from `constants/membership.ts` — one list of
 * privileges that the tickets, the ledger and the web all sell from — and
 * every figure from the store (`useMembershipPricing`, `societyPricing`).
 *
 * The purchase, founding-seat, restore and unlock logic below is the
 * battle-tested code from the previous page, kept as it was; what changed is
 * everything a member sees, and the four links at the foot, which now all
 * really go somewhere.
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, AppState, useWindowDimensions, Platform } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';

import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useAuthStore } from '@/src/stores/auth';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';
import { restorePurchases as restoreIAP, purchaseTier, showManageSubscriptions, isStoreReady, ReelHouseTier, BillingPeriod } from '@/src/lib/revenueCat';
import { safeOpenURL } from '@/src/utils/linking';
import { supabase } from '@/src/lib/supabase';
import { resolveTier, getTierWeight } from '@/src/utils/tier';
import { deckLabelProps } from '@/src/constants/textScaling';

import { PRIVILEGES, RANKS, rankById, type PaidRankId, type Rank } from '@/src/constants/membership';
import { GATED_FEATURES } from '@/src/constants/gatedFeatures';
import { recordGateEvent } from '@/src/utils/gateTelemetry';
import { useLocalSearchParams } from 'expo-router';
import { useMembershipPricing } from '@/src/hooks/useMembershipPricing';

import { SocietyPoster, type ReachedFor } from '@/src/components/society/SocietyPoster';
import { BillingSwitch } from '@/src/components/society/BillingSwitch';
import { RankTicket, type TicketState } from '@/src/components/society/RankTicket';
import { GeneralAdmission } from '@/src/components/society/GeneralAdmission';
import { PrivilegeLedger } from '@/src/components/society/PrivilegeLedger';
import { FoundingCertificate } from '@/src/components/society/FoundingCertificate';
import { SmallPrint, STORE } from '@/src/components/society/SmallPrint';
import { PurchaseDock, DOCK, DOCK_HEIGHT } from '@/src/components/society/PurchaseDock';
import { ticketPrice, savePercent, foundingPitch, type Billing } from '@/src/components/society/societyPricing';

/** The house's own legal pages — the same two Settings opens. */
export const TERMS_URL = 'https://www.thereelhousesociety.com/terms';
export const PRIVACY_URL = 'https://www.thereelhousesociety.com/privacy';
/** Where "Manage subscription" goes when the store's own sheet cannot open. */
export const MANAGE_URL = Platform.OS === 'android'
  ? 'https://play.google.com/store/account/subscriptions'
  : 'https://apps.apple.com/account/subscriptions';

/** Below this height the poster steps down so a ticket shows on the first screen. */
const SHORT_SCREEN = 740;
/** Clear space between the last line of the page and the window above it. */
export const SCROLL_BREATH = 32;

const PAID: (Rank & { id: PaidRankId })[] = RANKS.filter((r): r is Rank & { id: PaidRankId } => r.id !== 'cinephile');

export default function MembershipScreen() {

  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { user, isAuthenticated } = useAuthStore();
  const pricing = useMembershipPricing(); // live store prices (falls back to static)
  const [isRedirecting, setIsRedirecting] = useState(false);

  // ── Billing choice: monthly or yearly, the member's call ──────────────
  // Yearly is the default. If live pricing resolves and NO rank carries a
  // monthly product, the switch hides itself and the page sells yearly only —
  // a member can never pick a period the store can't honestly sell (see
  // selectPackageForTier's strict mode for the second half of that guarantee).
  const [billing, setBilling] = useState<BillingPeriod>('annual');
  // ── Founding seat cap (declared here so the AppState effect below can refresh it) ──
  const [foundingCount, setFoundingCount] = useState<number | null>(null);
  const monthlyKnownAbsent =
    Object.keys(pricing).length > 0 &&
    !Object.values(pricing).some((p) => !!p?.monthly);
  useEffect(() => {
    if (monthlyKnownAbsent && billing === 'monthly') setBilling('annual');
  }, [monthlyKnownAbsent, billing]);

  /**
   * WHICH DOOR SENT THEM, if a door did.
   *
   * `reason` is a feature id from `gatedFeatures.ts` — the same file the tickets
   * sell from and the same file `gates:check` verifies against production.
   * Resolving it here rather than passing prose through the URL means the slip
   * on the poster can never disagree with the promise on the ticket, which is
   * the failure that produced a Gilded Frame nobody built.
   *
   * An unrecognised or absent reason simply falls back to the general pitch:
   * a deep link somebody typed must not be able to blank the header.
   *
   * ── `returnTo` ARRIVES AND IS DELIBERATELY NOT YET READ ────────────────────
   * Every rope sends where the member was: the salon, the log (or, for an edit,
   * the log's own page), the writing desk. Honouring it is checkout work and
   * waits for the payments pass before launch — and the naive version is wrong:
   *
   *   · NOT on purchase. The rank lands a few seconds later (the unlock poll
   *     below); returning at once puts the member back in front of the same
   *     rope, still locked — worse than staying here.
   *   · Only once the poll CONFIRMS the new weight. On a timeout, stay.
   *   · Validate it: a route inside this app, never a scheme or a host — it
   *     arrives in a URL anybody can type.
   *
   * `theSocietyOpensOverYou.test.ts` fails the day this line reads it, so the
   * person doing that work is sent here first.
   */
  const { reason } = useLocalSearchParams<{ reason?: string; rank?: string; returnTo?: string }>();
  const cameFor = useMemo(
    () => (reason ? GATED_FEATURES.find((f) => f.id === reason) ?? null : null),
    [reason],
  );
  /** What they reached for, in the words the ticket sells it by. */
  const reachedFor: ReachedFor | null = useMemo(() => {
    if (!cameFor) return null;
    const p = PRIVILEGES.find((x) => x.name === cameFor.promise);
    if (!p) return null;
    // Mid-sentence: "It comes with the Archivist." — the rank's name without its capital.
    return { name: p.name, detail: p.detail, rankName: rankById(cameFor.rank).name.replace(/^The /, 'the ') };
  }, [cameFor]);

  /**
   * The middle of the funnel: a rope was tapped and the page actually opened.
   * Recorded once per arrival rather than on every render, and it carries the
   * door — so "which rope leads to the Society page" is answerable, and with
   * the purchase event below, so is "which rope leads to a rank".
   */
  useEffect(() => {
    recordGateEvent('membership_opened', {
      featureId: cameFor?.id,
      rank: cameFor?.rank,
    });
  }, [cameFor]);

  const [isRestoring, setIsRestoring] = useState(false);
  // Synchronous mutex prevents concurrent purchases.
  // React state batching makes useState unreliable as a concurrency guard —
  // two rapid taps can both read isRedirecting=false before either setState fires.
  const purchaseMutex = useRef(false);

  const lastCheckoutRef = useRef<number>(0);

  // Refresh session tier when returning from the store.
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

  // Rank hierarchy for what each ticket offers — prevents dead-end buttons and
  // accidental downgrades. An Auteur sees their rank held, never an offer of a
  // lower one.
  const TIER_RANK: Record<string, number> = { free: 0, cinephile: 0, archivist: 1, auteur: 2, founding: 3 };
  const userRank = isAuthenticated ? (TIER_RANK[userRole] ?? 0) : 0;
  const ticketState = (id: PaidRankId): TicketState => {
    const need = TIER_RANK[id];
    if (userRank === need || (id === 'auteur' && userRank > need)) return 'held';
    if (userRank > need) return 'included';
    return 'offer';
  };
  const offered = PAID.filter((r) => ticketState(r.id) === 'offer');

  // ── Which ticket is chosen ────────────────────────────────────
  // The rank the locked door needs, if a door sent them and it is on offer;
  // otherwise the house's recommendation; otherwise the one ticket left.
  const [chosen, setChosen] = useState<PaidRankId | null>(null);
  const selected: PaidRankId | null = useMemo(() => {
    const ids = offered.map((r) => r.id);
    if (chosen && ids.includes(chosen)) return chosen;
    if (cameFor && ids.includes(cameFor.rank)) return cameFor.rank;
    const rec = offered.find((r) => r.recommended);
    return rec?.id ?? ids[0] ?? null;
  }, [chosen, offered, cameFor]);

  const save = savePercent(pricing);
  const pitch = foundingPitch(pricing);
  const selectedPrice = selected ? ticketPrice(selected, billing as Billing, pricing) : null;

  /**
   * No store on this device (no key, or it failed to start): say so. The buy
   * button used to do NOTHING here — purchaseTier answers null, the same as a
   * member cancelling, and the page stayed silent.
   */
  const storeUnavailable = () => {
    if (isStoreReady()) return false;
    reelToast.error(`Couldn't reach ${STORE.name}. Please try again shortly.`);
    return true;
  };

  const handleCheckout = async (tier: string) => {
    if (!isAuthenticated || !user) {
      nav.push('/login');
      return;
    }
    if (storeUnavailable()) return;
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
        // The far end of the funnel. `reason` is the door that sent them, so
        // this is the only place that can say WHICH rope led to a purchase.
        recordGateEvent('rank_purchased', {
          featureId: cameFor?.id,
          rank: tier === 'auteur' || tier === 'founding' ? 'auteur' : 'archivist',
        });
        reelToast.success(`Welcome to the ${tier === 'auteur' ? 'Auteur' : 'Archivist'} rank. Your seat is ready.`);
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
            ? 'Monthly plans are being set up. Please try the yearly plan.'
            : 'Memberships are being set up. Please try again shortly.')
        : `Checkout is unavailable. Please check your ${STORE.name === 'Google Play' ? 'Google Play' : 'App Store'} account.`;
      reelToast.error(msg);
    } finally {
      setIsRedirecting(false);
      purchaseMutex.current = false;
    }
  };

  const handleFoundingCheckout = async () => {
    if (!isAuthenticated || !user) { nav.push('/login'); return; }
    if (storeUnavailable()) return;
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
        reelToast.success('Welcome to the Founding Board.');
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
                reelToast.info('The final Founding seat was claimed just before your purchase. You have the Auteur rank — write to support@thereelhousesociety.com about your seat.');
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
        ? 'Memberships are being set up. Please try again shortly.'
        : `Checkout is unavailable. Please check your ${STORE.name === 'Google Play' ? 'Google Play' : 'App Store'} account.`;
      reelToast.error(msg);
    } finally {
      setIsRedirecting(false);
      purchaseMutex.current = false;
    }
  };

  // ── Restore — required by both stores ─────────────────────────────────────
  const handleRestore = async () => {
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
        reelToast.error(`Couldn't reach ${STORE.name} — your membership is unchanged.`);
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
        const restored = result.tier === 'founding' ? 'your founding seat' : `the ${result.tier === 'auteur' ? 'Auteur' : 'Archivist'} rank`;
        reelToast.success(`Restored — ${restored} is yours again.`);
      } else {
        // The store answered and reported nothing active. restorePurchases has
        // already sent that downgrade to the server, where grant_entitlement
        // decides whether it is allowed — it refuses to lower a tier bought on
        // the website or granted by hand. So ask the server for the truth
        // instead of guessing locally, which is what used to demote web buyers.
        await authStore.restoreSession?.();
        reelToast.info(`${STORE.name === 'Google Play' ? 'Google Play' : 'The App Store'} has no active membership for this account.`);
      }
    } catch {
      reelToast.error('Restore failed. Please try again.');
    } finally {
      setIsRestoring(false);
      purchaseMutex.current = false;
    }
  };

  // ── Manage — the store's own sheet, or its address when that cannot open ──
  const handleManage = async () => {
    const shown = await showManageSubscriptions();
    if (!shown) await safeOpenURL(MANAGE_URL, `Open ${STORE.settings} to manage your subscription.`);
  };

  // ── The legal pages, read without leaving the app ─────────────────────────
  const openLegal = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url, {
        controlsColor: colors.sepia,
        toolbarColor: colors.ink,
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch {
      await safeOpenURL(url);
    }
  };

  const showDock = selected !== null && selectedPrice !== null;
  const selectedRank = selected ? rankById(selected) : null;
  const founder = userRole === 'founding';
  const showFounding = founder || (foundingCount !== null && foundingCount < 100);

  return (
    <View style={st.container}>
      {/* Nav */}
      <View style={[st.navBar, { paddingTop: insets.top + 4 }]}>
        <PressableScale onPress={() => nav.back()} style={st.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="light" accessibilityRole="button" accessibilityLabel="Go back">
          <ChevronLeft size={24} color={colors.bone} />
        </PressableScale>
        <PressableScale
          onPress={handleRestore}
          disabled={isRestoring || isRedirecting}
          style={st.navBtnRight}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          haptic="light"
          accessibilityRole="button"
          accessibilityLabel={isRestoring ? 'Restoring purchases' : 'Restore purchases'}
          accessibilityState={{ disabled: isRestoring || isRedirecting, busy: isRestoring }}
        >
          <Text style={st.restore} {...deckLabelProps}>{isRestoring ? 'RESTORING…' : 'RESTORE'}</Text>
        </PressableScale>
      </View>

      <ScrollView
        // The window's exact height and the inset it sits on, then room to breathe,
        // so the last line of the small print always scrolls clear of the window.
        contentContainerStyle={{ paddingBottom: (showDock ? DOCK_HEIGHT + Math.max(insets.bottom, DOCK.minInset) : insets.bottom) + SCROLL_BREATH }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(500)}>
          <SocietyPoster reachedFor={reachedFor} compact={height < SHORT_SCREEN} />
        </Animated.View>

        {!monthlyKnownAbsent && offered.length > 0 ? (
          <BillingSwitch billing={billing as Billing} save={save} onChange={(b) => { TactileEngine.selection(); setBilling(b); }} />
        ) : null}

        {/* One choice among the tickets on offer: a radio group, so VoiceOver
            says "1 of 2" and a switch-access user moves through them as a set. */}
        <View style={st.tickets} accessibilityRole="radiogroup" accessibilityLabel="Choose a rank">
          {PAID.map((rank) => {
            const state = ticketState(rank.id);
            return (
              <RankTicket
                key={rank.id}
                rank={rank}
                state={state}
                selected={selected === rank.id}
                price={state === 'offer' ? ticketPrice(rank.id, billing as Billing, pricing) : null}
                includes={rank.id === 'auteur' && userRank === 1 ? 'EVERYTHING YOU HAVE, AND —' : (rank.includes ?? '')}
                onSelect={() => setChosen(rank.id)}
              />
            );
          })}
        </View>

        <GeneralAdmission yours={isAuthenticated && userRank === 0} />

        <PrivilegeLedger />

        {showFounding ? (
          <FoundingCertificate
            founder={founder}
            pitch={pitch}
            busy={isRedirecting || isRestoring}
            onClaim={handleFoundingCheckout}
          />
        ) : null}

        <SmallPrint
          restoring={isRestoring}
          busy={isRedirecting}
          onRestore={handleRestore}
          onManage={handleManage}
          onTerms={() => openLegal(TERMS_URL)}
          onPrivacy={() => openLegal(PRIVACY_URL)}
        />
      </ScrollView>

      {showDock && selectedRank && selectedPrice ? (
        <PurchaseDock
          summary={selectedPrice.summary}
          cta={selectedRank.cta}
          spoken={`${selectedRank.cta.charAt(0)}${selectedRank.cta.slice(1).toLowerCase()}, ${selectedPrice.spoken}`}
          auteur={selected === 'auteur'}
          busy={isRedirecting || isRestoring}
          onBuy={() => selected && handleCheckout(selected)}
          bottomInset={insets.bottom}
        />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  navBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 2 },
  navBtn: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  navBtnRight: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 12 },
  restore: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.bone, includeFontPadding: false },
  tickets: { gap: 20, marginTop: 16 },
});
