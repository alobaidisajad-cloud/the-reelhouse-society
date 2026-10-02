import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import type { ProfileAnalyticsPayload } from './NoirPassport';
import { decorativeTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { rungAt } from '@/src/constants/standing';
import { EDGE_LIT } from '@/src/theme/light';
import { RoomRetrieving, RoomUnreachable } from './RoomParts';

/** The member's record over the WHOLE history (the server's count). */
type Stamps = NonNullable<ProfileAnalyticsPayload['stamps']>;

/**
 * How many films this member has logged: `totalFilms`, the reconciled count
 * printed at the top of the page (so the honours and that number never
 * disagree), else the record's own.
 */
function filmCount(s: Stamps, reconciled?: number): number {
  if (typeof reconciled === 'number' && reconciled > 0) return reconciled;
  return s.total_logs;
}

interface Badge {
  id: string;
  title: string;
  desc: string;
  glyph: string;
  check: (s: Stamps, total?: number) => boolean;
}

export const BADGES: Badge[] = [
  {
    id: 'first-reel',
    title: 'FIRST REEL',
    desc: 'Log your first film',
    glyph: '✦',
    check: (s, total) => filmCount(s, total) >= rungAt('FIRST REEL'),
  },
  {
    id: 'the-regular',
    title: 'THE REGULAR',
    desc: 'Log 10 films',
    glyph: '❖',
    check: (s, total) => filmCount(s, total) >= rungAt('THE REGULAR'),
  },
  {
    id: 'midnight-devotee',
    title: 'MIDNIGHT DEVOTEE',
    desc: 'Log 25 films',
    glyph: '◆',
    check: (s, total) => filmCount(s, total) >= rungAt('MIDNIGHT DEVOTEE'),
  },
  {
    id: 'the-oracle',
    title: 'THE ORACLE',
    desc: 'Log 100 films',
    glyph: '◈',
    check: (s, total) => filmCount(s, total) >= rungAt('THE ORACLE'),
  },
  {
    id: 'the-connoisseur',
    title: 'THE CONNOISSEUR',
    desc: 'Rate 5 films with 5 reels',
    glyph: '✧',
    check: (s) => s.perfect_ratings_count >= 5,
  },
  {
    id: 'the-critic',
    title: 'THE CRITIC',
    desc: 'Write 10 reviews',
    glyph: '§',
    check: (s) => s.reviews_count >= 10,
  },
  {
    id: 'genre-explorer',
    title: 'GENRE EXPLORER',
    desc: 'Log films in 5+ genres',
    glyph: '⊕',
    check: (s) => s.genres_count >= 5,
  },
  {
    id: 'decade-drifter',
    title: 'DECADE DRIFTER',
    desc: 'Watch films from 4+ decades',
    glyph: '⊗',
    check: (s) => s.decades_logged_count >= 4,
  },
  {
    id: 'marathon-runner',
    title: 'MARATHON RUNNER',
    desc: 'Log 3+ films in one day',
    glyph: '⟐',
    check: (s) => s.busiest_day_count >= 3,
  },
  {
    id: 'the-completionist',
    title: 'THE COMPLETIONIST',
    desc: 'Rate every logged film',
    glyph: '⊛',
    check: (s, total) => filmCount(s, total) >= 5 && s.unrated_count === 0,
  },
];

/**
 * SOCIETY HONORS, earned from the member's whole record. Until that record has
 * been read the case says so (and, if it could not be, offers to ask again):
 * an honour is never judged from the logs that happened to load.
 */
export function Achievements({ analytics, totalFilms, failed, onRetry }: {
  analytics?: ProfileAnalyticsPayload | null;
  totalFilms?: number;
  /** The record's read failed. */
  failed?: boolean;
  onRetry?: () => void;
}) {
  const stamps = analytics?.stamps;
  const earned = useMemo(() =>
    stamps ? BADGES.map(b => ({ ...b, unlocked: b.check(stamps, totalFilms) })) : [],
    [stamps, totalFilms]
  );

  const unlockedCount = earned.filter(b => b.unlocked).length;

  /**
   * Three across leaves a badge about 64pt on a 320pt phone (an iPhone SE),
   * and at large type CONNOISSEUR is ~15pt wider than that even at its
   * smallest allowed size, so the phone broke it mid-letter — and still 1pt
   * wider on a 360pt Android. Below 375pt the badges sit two across; from the
   * iPhone mini up they keep the approved three. Measured at every width in
   * mockups/devices.json.
   */
  const { width } = useWindowDimensions();
  const narrow = width < 375;

  if (!stamps) {
    return (
      <View style={s.container}>
        {failed || analytics
          ? <RoomUnreachable room="the honours" onRetry={onRetry ?? (() => {})} />
          : <RoomRetrieving room="the honours" />}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text {...scaledTextProps} style={s.title}>SOCIETY HONORS</Text>
        <Text {...scaledTextProps} style={s.countText}>{unlockedCount}/{BADGES.length} EARNED</Text>
      </View>

      <View style={s.grid}>
        {earned.map((badge) => (
          <PressableScale hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            key={badge.id}
            onPress={() => reelToast(`${badge.title}: ${badge.desc}`)}
            style={[
              s.badgeItem,
              narrow && s.badgeItemNarrow,
              badge.unlocked ? s.badgeUnlocked : s.badgeLocked,
            ]}
            pressedScale={0.93}
            accessibilityRole="button"
            accessibilityLabel={`${badge.title}, ${badge.unlocked ? 'earned' : 'not yet earned'}`}
            accessibilityHint={badge.desc}
          >
            <Text {...decorativeTextProps} style={[s.badgeGlyph, badge.unlocked ? s.glyphUnlocked : s.glyphLocked]}>
              {badge.glyph}
            </Text>
            {/* A title is two words at most, and a word must not break. At the
                largest text size CONNOISSEUR is ~9pt wider than a third of the
                case, and the phone split it mid-letter; it now gives up just
                enough size to stay whole. At the default size nothing shrinks. */}
            <Text {...scaledTextProps} style={[s.badgeTitle, badge.unlocked ? s.titleUnlocked : s.titleLocked]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
              {badge.title}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { ...EDGE_LIT,
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.2)',
    borderRadius: 4,
    padding: 20,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.parchment,
  },
  countText: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.sepia,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeItem: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 3,
  },
  badgeItemNarrow: { minWidth: '45%' },
  badgeUnlocked: {
    backgroundColor: 'rgba(184,137,26,0.06)',
    borderColor: 'rgba(184,137,26,0.2)',
  },
  badgeLocked: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.03)',
  },
  badgeGlyph: {
    fontSize: 24,
    lineHeight: 28,
    marginBottom: 4,
  },
  glyphUnlocked: {
    color: colors.sepia,
    textShadowColor: 'rgba(184,137,26,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  glyphLocked: {
    color: colors.ash,
    opacity: 0.5,
  },
  badgeTitle: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  titleUnlocked: {
    color: colors.flicker,
  },
  titleLocked: {
    color: colors.fogQuiet,
    opacity: 0.5,
  },
});
