import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';

const BADGES = [
  {
    id: 'first-reel',
    title: 'FIRST REEL',
    desc: 'Log your first film',
    glyph: '✦',
    check: (logs: any[]) => logs.length >= 1,
  },
  {
    id: 'the-regular',
    title: 'THE REGULAR',
    desc: 'Log 10 films',
    glyph: '❖',
    check: (logs: any[]) => logs.length >= 10,
  },
  {
    id: 'midnight-devotee',
    title: 'MIDNIGHT DEVOTEE',
    desc: 'Log 25 films',
    glyph: '◆',
    check: (logs: any[]) => logs.length >= 25,
  },
  {
    id: 'the-oracle',
    title: 'THE ORACLE',
    desc: 'Log 100 films',
    glyph: '◈',
    check: (logs: any[]) => logs.length >= 100,
  },
  {
    id: 'the-connoisseur',
    title: 'THE CONNOISSEUR',
    desc: 'Rate 5 films with 5 reels',
    glyph: '✧',
    check: (logs: any[]) => logs.filter((l: any) => l.rating === 5).length >= 5,
  },
  {
    id: 'the-critic',
    title: 'THE CRITIC',
    desc: 'Write 10 reviews',
    glyph: '§',
    check: (logs: any[]) => logs.filter((l: any) => l.review?.length > 20).length >= 10,
  },
  {
    id: 'genre-explorer',
    title: 'GENRE EXPLORER',
    desc: 'Log films in 5+ genres',
    glyph: '⊕',
    check: (logs: any[]) => {
      const genres = new Set<string>();
      logs.forEach((l: any) => l.genres?.forEach((g: any) => genres.add(g.id || g)));
      return genres.size >= 5;
    },
  },
  {
    id: 'decade-drifter',
    title: 'DECADE DRIFTER',
    desc: 'Watch films from 4+ decades',
    glyph: '⊗',
    check: (logs: any[]) => {
      const decades = new Set<number>();
      logs.forEach((l: any) => { if (l.year) decades.add(Math.floor(l.year / 10) * 10); });
      return decades.size >= 4;
    },
  },
  {
    id: 'marathon-runner',
    title: 'MARATHON RUNNER',
    desc: 'Log 3+ films in one day',
    glyph: '⟐',
    check: (logs: any[]) => {
      const counts: Record<string, number> = {};
      logs.forEach((l: any) => {
        const d = (l.watchedDate || l.createdAt || '').slice(0, 10);
        if (d) counts[d] = (counts[d] || 0) + 1;
      });
      return Object.values(counts).some(c => c >= 3);
    },
  },
  {
    id: 'the-completionist',
    title: 'THE COMPLETIONIST',
    desc: 'Rate every logged film',
    glyph: '⊛',
    check: (logs: any[]) => logs.length >= 5 && logs.every((l: any) => l.rating > 0),
  },
];

export function Achievements({ logs }: { logs: any[] }) {
  const earned = useMemo(() =>
    BADGES.map(b => ({ ...b, unlocked: b.check(logs) })),
    [logs]
  );

  const unlockedCount = earned.filter(b => b.unlocked).length;

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.title}>SOCIETY HONORS</Text>
        <Text style={s.countText}>{unlockedCount}/{BADGES.length} EARNED</Text>
      </View>

      <View style={s.grid}>
        {earned.map((badge) => (
          <View
            key={badge.id}
            style={[
              s.badgeItem,
              badge.unlocked ? s.badgeUnlocked : s.badgeLocked,
            ]}
          >
            <Text style={[s.badgeGlyph, badge.unlocked ? s.glyphUnlocked : s.glyphLocked]}>
              {badge.glyph}
            </Text>
            <Text style={[s.badgeTitle, badge.unlocked ? s.titleUnlocked : s.titleLocked]} numberOfLines={2}>
              {badge.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.soot,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ash,
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
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.parchment,
  },
  countText: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.sepia,
    opacity: 0.7,
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
  badgeUnlocked: {
    backgroundColor: 'rgba(196,150,26,0.06)',
    borderColor: 'rgba(196,150,26,0.2)',
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
    textShadowColor: 'rgba(196,150,26,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  glyphLocked: {
    color: colors.ash,
    opacity: 0.5,
  },
  badgeTitle: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  titleUnlocked: {
    color: colors.flicker,
  },
  titleLocked: {
    color: colors.ash,
    opacity: 0.5,
  },
});
