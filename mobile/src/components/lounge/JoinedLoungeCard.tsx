import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { nav } from '@/src/utils/typedRouter';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, Lock, Film as FilmIcon, DoorOpen, Hourglass } from 'lucide-react-native';
import { LoungeRoom } from '@/src/stores/lounge';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { usePulse } from './PulseContext';

export const JoinedLoungeCard = React.memo(({ lounge, index }: { lounge: LoungeRoom; index: number }) => {

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
  const hasUnread = Boolean(lounge.unread_count && lounge.unread_count > 0);
  const isAwaiting = lounge.membership_status === 'pending';
  const atDoor = lounge.pending_count || 0;

  return (
    <View>
      <PressableScale
        style={s.joinedCard}
        onPress={() => nav.push(`/lounge/${lounge.id}`)}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Enter screening room ${lounge.name}`}
      >
        <View style={s.joinedImgWrap}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={s.joinedImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
          ) : (
            <LinearGradient
              colors={['rgba(196,150,26,0.06)', 'rgba(11,10,8,0.95)']}
              style={s.joinedImgPlaceholder}
            >
              <FilmIcon size={22} color={colors.sepia} strokeWidth={1} />
            </LinearGradient>
          )}

          <LinearGradient
            colors={['transparent', 'rgba(11,10,8,0.85)']}
            style={s.joinedGradient}
          />

          {hasUnread && !isAwaiting && <Animated.View style={[s.unreadDot, pulseStyle]} />}

          {atDoor > 0 && (
            <View style={s.doorBadge}>
              <DoorOpen size={9} color={colors.ink} strokeWidth={2} />
              <Text style={s.doorBadgeText}>{atDoor}</Text>
            </View>
          )}

          {isAwaiting && (
            <View style={s.awaitingBadge}>
              <Hourglass size={8} color={colors.sepia} strokeWidth={2} />
              <Text style={s.awaitingText}>AWAITING</Text>
            </View>
          )}

          <View style={s.joinedNameOverlay}>
            <Text style={s.joinedNameText} numberOfLines={2}>{lounge.name}</Text>
            <View style={s.joinedMetaRow}>
              <Users size={10} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.joinedMetaText} numberOfLines={1}>
                {lounge.member_count || 0}
              </Text>
              {lounge.is_private && (
                <>
                  <View style={s.joinedMetaLine} />
                  <Lock size={10} color={colors.sepia} strokeWidth={1.5} />
                </>
              )}
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});
JoinedLoungeCard.displayName = 'JoinedLoungeCard';

const s = StyleSheet.create({
  joinedCard: {
    width: 140,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.soot,
    borderWidth: 1.5,
    borderColor: 'rgba(139,105,20,0.3)',
    ...effects.shadowSurface,
    elevation: 8,
  },
  joinedImgWrap: {
    width: '100%',
    aspectRatio: 1 / 1.35,
    overflow: 'hidden',
    position: 'relative',
  },
  joinedImg: {
    width: '100%',
    height: '100%',
  },
  joinedImgPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinedGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '75%',
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.bloodReel,
    borderWidth: 2,
    borderColor: colors.ink,
    zIndex: 10,
  },
  doorBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.sepia,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 10,
  },
  doorBadgeText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    color: colors.ink,
  },
  awaitingBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,10,8,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,137,26,0.5)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 10,
  },
  awaitingText: {
    fontFamily: fonts.uiMedium,
    fontSize: 7.5,
    letterSpacing: 1,
    color: colors.sepia,
  },
  joinedNameOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
  },
  joinedNameText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 14,
    color: colors.parchment,
    marginBottom: 8,
    lineHeight: 18,
  },
  joinedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  joinedMetaText: {
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 2,
    color: colors.fog,
  },
  joinedMetaLine: {
    height: 10,
    width: 1.5,
    backgroundColor: colors.ash,
  },
});
