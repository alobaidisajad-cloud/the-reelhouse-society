/**
 * JoinedLoungeCard — a lit doorway on YOUR SALONS strip.
 * Honest seals only: a crimson "N NEW" when unread dispatches truly
 * wait, a brass door-count when guests truly stand at your door,
 * AWAITING while the host considers you. Nothing pulses, nothing lies.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { nav } from '@/src/utils/typedRouter';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, Lock, Film as FilmIcon, DoorOpen, Hourglass } from 'lucide-react-native';
import { LoungeRoom } from '@/src/stores/lounge';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';

export const JoinedLoungeCard = React.memo(({ lounge, index: _index }: { lounge: LoungeRoom; index: number }) => {
  const coverUrl = lounge.cover_image
    ? tmdb.backdrop(lounge.cover_image, 'w500')
    : null;
  const unread = lounge.unread_count ?? 0;
  const hasUnread = unread > 0;
  const isAwaiting = lounge.membership_status === 'pending';
  const atDoor = lounge.pending_count || 0;
  const unreadLabel = unread > 9 ? '9+ NEW' : `${unread} NEW`;

  return (
    <View>
      <PressableScale
        style={s.joinedCard}
        onPress={() => nav.push(`/lounge/${lounge.id}`)}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Enter salon ${lounge.name}${hasUnread ? `, ${unread} new dispatches` : ''}`}
      >
        <View style={s.joinedImgWrap}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={s.joinedImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
          ) : (
            <LinearGradient
              colors={['rgba(184,137,26,0.06)', 'rgba(11,10,8,0.95)']}
              style={s.joinedImgPlaceholder}
            >
              <FilmIcon size={22} color={colors.sepia} strokeWidth={1} />
            </LinearGradient>
          )}

          <LinearGradient
            colors={['transparent', 'rgba(11,10,8,0.85)']}
            style={s.joinedGradient}
          />

          {hasUnread && !isAwaiting && atDoor === 0 && (
            <View style={s.unreadSeal}>
              <Text style={s.unreadSealText}>{unreadLabel}</Text>
            </View>
          )}

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
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
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
  // The honest seal — crimson only when dispatches truly wait.
  unreadSeal: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.crimson,
    borderWidth: 1,
    borderColor: colors.ink,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    zIndex: 10,
  },
  unreadSealText: {
    fontFamily: fonts.sub,
    fontSize: 6.5,
    letterSpacing: 0.5,
    color: colors.flicker,
    includeFontPadding: false,
  },
  doorBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
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
    fontFamily: fonts.sub,
    fontSize: 9,
    color: colors.ink,
    includeFontPadding: false,
  },
  awaitingBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
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
    fontFamily: fonts.sub,
    fontSize: 6.5,
    letterSpacing: 1,
    color: colors.sepia,
    includeFontPadding: false,
  },
  joinedNameOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 11,
    paddingBottom: 12,
    paddingTop: 4,
  },
  joinedNameText: {
    fontFamily: fonts.sub,
    letterSpacing: 0.5,
    fontSize: 12,
    color: colors.parchment,
    marginBottom: 6,
    lineHeight: 16,
  },
  joinedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  joinedMetaText: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.fog,
    includeFontPadding: false,
  },
  joinedMetaLine: {
    height: 10,
    width: 1,
    backgroundColor: colors.ash,
  },
});
