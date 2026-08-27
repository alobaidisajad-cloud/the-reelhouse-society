/**
 * FilmStub — one control, docked, for everything you can do to a film.
 *
 * ── WHAT IT REPLACES ────────────────────────────────────────────────────────
 * A console three rows deep: LOG THIS FILM, a rewatch line, and a stamp bar of
 * WATCHLIST / TRAILER / SHARE / LOUNGE. Six controls competing at the top of
 * the page, reachable only by scrolling back to it.
 *
 * ── WHY A TICKET STUB ───────────────────────────────────────────────────────
 * The app's brass ＋ already means "the concierge — make something, anywhere".
 * A second ＋ here would mean something different in the same visual language,
 * which is how an app starts feeling assembled rather than designed. So this is
 * not a ＋ and not a ⋯: it is your ticket stub for this film. It states where
 * you stand, and pressing it raises the rest of the ticket.
 *
 * It has two lives:
 *   before you have seen it — the invitation, in brass
 *   after — a record, dark, with the brass moved to its edge
 *
 * ── ONE BRASS OBJECT ON SCREEN AT A TIME ────────────────────────────────────
 * With the tray open, a brass stub reading LOG THIS FILM sat directly beneath a
 * brass row reading LOG THIS FILM: the same words twice and two places for the
 * eye to go. So while the tray is open the stub is only the handle, and states
 * your standing instead. The brass then lives on exactly one thing at any
 * moment — whatever the act is.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ticket, Bookmark, ChevronUp, ChevronDown } from 'lucide-react-native';

import { colors, fonts } from '@/src/theme/theme';
import { BRASS, BRASS_STOPS, BRASS_START, BRASS_END, CROWN, CROWN_HEIGHT, ON_BRASS, ON_BRASS_RULE } from '@/src/theme/brass';
import { scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import { STUB_HEIGHT, STUB_PAD_TOP, dockHeight } from './filmStubMetrics';

export interface FilmStubProps {
  /**
   * null when the member has never logged it. `watchedDate` is nullable in the
   * domain type and the stub never reads it anyway — the caller formats dates.
   */
  existingLog: { status?: string; rating?: number; viewCount?: number } | null;
  isWatchlisted: boolean;
  /** Already formatted by the caller — this component never touches a date. */
  watchedLabel: string | null;
  open: boolean;
  onPress: () => void;
  bottomInset: number;
}

/** The machined face: the ramp, then the crown over the top of it. */
const BrassFace = memo(function BrassFace() {
  return (
    <>
      <LinearGradient
        colors={BRASS}
        locations={BRASS_STOPS}
        start={BRASS_START}
        end={BRASS_END}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={CROWN}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={s.crown}
        pointerEvents="none"
      />
    </>
  );
});

export const FilmStub = memo(function FilmStub({
  existingLog, isWatchlisted, watchedLabel, open, onPress, bottomInset,
}: FilmStubProps) {
  const Chevron = open ? ChevronDown : ChevronUp;

  /**
   * Five states, not two. `abandoned` is a real status in this app and the
   * first design of this control would have printed SEEN over it.
   */
  const state = useMemo(() => {
    if (!existingLog) return isWatchlisted ? 'shelved' : 'unseen';
    if (existingLog.status === 'abandoned') return 'abandoned';
    if ((existingLog.viewCount ?? 1) > 1) return 'rewatched';
    return 'seen';
  }, [existingLog, isWatchlisted]);

  const inviting = (state === 'unseen' || state === 'shelved') && !open;

  const label = state === 'rewatched' ? `SEEN ×${existingLog?.viewCount ?? 2}`
    : state === 'abandoned' ? 'ABANDONED'
    : state === 'seen' ? 'SEEN'
    : state === 'shelved' ? 'ON THE WATCHLIST'
    : 'NOT YET SEEN';

  const logged = state === 'seen' || state === 'rewatched' || state === 'abandoned';
  const rating = existingLog?.rating ?? 0;

  /**
   * ── WHAT IS HEARD MUST BE WHAT IS SEEN ────────────────────────────────────
   * This used to announce the record label unconditionally, so a shelved film
   * that DISPLAYED "LOG THIS FILM" was READ OUT as "On the watchlist". A
   * sighted member and a blind one were told two different things by the same
   * control, and nothing about the screen would ever have shown it.
   *
   * So the announcement is built from what is actually on the face, plus the
   * standing it does not have room to say, plus what pressing does — because
   * "Seen, four reels" alone gives a member no reason to press anything.
   */
  const a11yLabel = (() => {
    const parts: string[] = [];
    if (inviting) {
      parts.push('Log this film');
      if (state === 'shelved') parts.push('on the watchlist');
    } else {
      parts.push(label.replace('×', 'times '));
      if (logged && rating > 0) parts.push(`rated ${rating}`);
      if (watchedLabel) parts.push(watchedLabel);
    }
    return `${parts.join(', ')}. ${open ? 'Closes' : 'Opens'} film actions.`;
  })();

  const body = inviting ? (
    // A view that CLIPS cannot also cast a shadow on iOS, so the glow lives on
    // the host outside and the ramp is clipped by the face within.
    <View style={s.shadowHost}>
      <View style={s.face}>
        <BrassFace />
        {/* Shelved is carried by ONE glyph rather than a second row. */}
        {state === 'shelved'
          ? <Bookmark size={15} color={ON_BRASS} fill={ON_BRASS} strokeWidth={2} />
          : <Ticket size={15} color={ON_BRASS} strokeWidth={2} />}
        <View style={[s.tear, { borderLeftColor: ON_BRASS_RULE }]} />
        <Text {...scaledTextProps} style={s.invite} numberOfLines={1}>LOG THIS FILM</Text>
        <View style={s.grow} />
        <Chevron size={16} color={ON_BRASS} strokeWidth={2.5} />
      </View>
    </View>
  ) : (
    <View style={s.record}>
      {/* Even the edge is metal — a ramp, not a painted stripe. */}
      <LinearGradient
        colors={[colors.champagne, colors.sepia, colors.tarnishDeep]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={s.recordEdge}
      />
      {state === 'shelved'
        ? <Bookmark size={15} color={colors.sepia} fill={colors.sepia} strokeWidth={1.75} />
        : <Ticket size={15} color={colors.sepia} strokeWidth={1.75} />}
      <View style={[s.tear, { borderLeftColor: 'rgba(184,137,26,0.4)' }]} />
      <Text {...scaledTextProps} style={s.recordLabel} numberOfLines={1}>{label}</Text>
      {logged && rating > 0 && <ReelRating rating={rating} size={13} />}
      {logged && watchedLabel ? (
        <Text {...scaledTextProps} style={s.recordDate} numberOfLines={1}>{watchedLabel}</Text>
      ) : null}
      <View style={s.grow} />
      <Chevron size={16} color={colors.sepia} strokeWidth={2} />
    </View>
  );

  return (
    <View style={[s.dock, { paddingBottom: Math.max(bottomInset, 16) }]} testID="film-stub-dock">
      <PressableScale
        testID="film-stub"
        onPress={onPress}
        pressedScale={0.985}
        // The plate is 52pt tall and full width — far past the 44pt minimum —
        // and it sits directly under the scrolling page. Vertical slop would
        // steal taps from whatever is above it, so there is none.
        hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ expanded: open }}
      >
        {body}
      </PressableScale>
    </View>
  );
});

const s = StyleSheet.create({
  dock: {
    /**
     * ── ABOVE THE TRAY, DELIBERATELY ────────────────────────────────────────
     * The tray layer sits at 60. At 40 the stub was PAINTED OVER by it: the
     * tray opened and the handle that raised it disappeared, leaving the scrim
     * as the only way out and breaking the one thing this design promises —
     * that the control never moves out from under your thumb.
     *
     * So the stub floats above the tray, which is also what makes the chevron
     * flip legible: the same object, still in the same place, now pointing down.
     */
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 70,
    paddingHorizontal: 20, paddingTop: STUB_PAD_TOP,
    backgroundColor: 'rgba(8,6,4,0.96)',
    borderTopWidth: 1, borderTopColor: colors.sepiaBorder,
  },
  shadowHost: {
    borderRadius: 2,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  face: {
    height: STUB_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, borderRadius: 2, overflow: 'hidden',
  },
  crown: { position: 'absolute', top: 0, left: 0, right: 0, height: CROWN_HEIGHT },
  record: {
    height: STUB_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: 17, paddingRight: 14, borderRadius: 2, overflow: 'hidden',
    backgroundColor: 'rgba(25,23,20,0.8)',
    borderWidth: 1, borderColor: colors.sepiaBorder,
  },
  recordEdge: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 3 },
  /** The ticket's tear line — the one stroke that says "stub". */
  tear: { width: 1, height: 22, borderLeftWidth: 1, borderStyle: 'dashed' },
  invite: { fontFamily: fonts.sub, fontSize: 12, color: ON_BRASS, letterSpacing: 2, includeFontPadding: false },
  recordLabel: { fontFamily: fonts.sub, fontSize: 11, color: colors.parchment, letterSpacing: 2, includeFontPadding: false },
  recordDate: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, letterSpacing: 1.2, includeFontPadding: false },
  grow: { flex: 1 },
});

export { dockHeight };
