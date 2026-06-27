import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { nav } from '@/src/utils/typedRouter';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, Lock, ChevronRight } from 'lucide-react-native';
import { LoungeRoom } from '@/src/stores/lounge';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { usePulse } from './PulseContext';

export const PublicLoungeCard = React.memo(({ lounge, index }: { lounge: LoungeRoom; index: number }) => {

  const ctx = usePulse();

  const isScrolling = ctx?.isScrolling;
  const pulse = ctx?.pulse;

  const pulseStyle = useAnimatedStyle(() => {
    if (!isScrolling || !pulse) return { opacity: 0.7 };
    return { opacity: isScrolling.value ? 1 : pulse.value };
  });

  const coverUrl = lounge.cover_image
    ? tmdb.backdrop(lounge.cover_image, 'w500')
    : null;

  return (
    <View style={s.cardWrapper}>
      <PressableScale
        style={s.publicCard}
        onPress={() => nav.push(`/lounge/${lounge.id}`)}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Enter salon ${lounge.name}${lounge.is_private ? ', approval required' : ''}`}
      >
        <View style={s.publicAccentBar} />
        
        {coverUrl && (
          <View style={s.publicImgTop}>
            <Image source={{ uri: coverUrl }} style={s.publicImgContent} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.015)']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}

        <View style={s.publicBody}>
          <Text style={s.publicName} numberOfLines={2}>{lounge.name}</Text>
          {lounge.is_private && (
            <View style={s.publicPrivateBadge}>
              <Lock size={10} color={colors.sepia} strokeWidth={1.5} />
              <Text style={s.publicPrivateText}>BY REQUEST</Text>
            </View>
          )}
          <Text style={s.publicDesc} numberOfLines={3}>
            {lounge.description || 'A cinematic gathering place.'}
          </Text>
          
          <View style={s.publicFooter}>
            <View style={s.publicMetaRow}>
              <Users size={12} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.publicMetaText} numberOfLines={1}>{lounge.member_count || 0} SEATS TAKEN</Text>
            </View>
            <View style={s.publicEnterTag}>
              {!lounge.is_private && <Animated.View style={[s.liveIndicator, pulseStyle]} />}
              <Text style={[s.publicEnterText, { flexShrink: 1 }]} numberOfLines={1}>
                {lounge.is_private ? '[ REQUEST TO JOIN ]' : '[ TAKE A SEAT ]'}
              </Text>
              {lounge.is_private 
                ? <Lock size={12} color={colors.sepia} strokeWidth={2} />
                : <ChevronRight size={12} color={colors.sepia} strokeWidth={2} />
              }
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});
PublicLoungeCard.displayName = 'PublicLoungeCard';

const s = StyleSheet.create({
  cardWrapper: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  publicCard: {
    padding: 24, paddingLeft: 28,
    backgroundColor: 'rgba(12,9,7,0.85)',
    borderWidth: 1.5, borderColor: 'rgba(139,105,20,0.3)', borderStyle: 'dashed',
    borderRadius: 4, position: 'relative',
    overflow: 'hidden',
    ...effects.shadowSurface,
  },
  publicAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    backgroundColor: colors.sepia, zIndex: 2,
  },
  publicImgTop: {
    width: '100%',
    height: 120,
    marginBottom: 20,
    borderRadius: 2,
    overflow: 'hidden',
    borderColor: 'rgba(139,105,20,0.2)',
    borderWidth: 1.5,
  },
  publicImgContent: { width: '100%', height: '100%' },
  publicBody: { flex: 1 },
  publicName: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.parchment,
    marginBottom: 10,
    lineHeight: 26,
  },
  publicDesc: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.bone,
    lineHeight: 20,
    marginBottom: 24,
    opacity: 0.8,
  },
  publicPrivateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(196,150,26,0.04)',
    borderRadius: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
    borderStyle: 'dashed',
  },
  publicPrivateText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 2.5,
    color: colors.sepia,
  },
  publicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,105,20,0.15)',
    paddingTop: 16,
    marginTop: 8,
  },
  publicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  publicMetaText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.fog,
  },
  publicEnterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  publicEnterText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 2.5,
    color: colors.sepia,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bloodReel,
    marginRight: 6,
  },
});
