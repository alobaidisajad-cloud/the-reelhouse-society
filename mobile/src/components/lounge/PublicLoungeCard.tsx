/**
 * PublicLoungeCard — a door plaque in THE CORRIDOR.
 * Brass accent bar, Rye nameplate, Courier description, a typewriter
 * verb on every door. Private rooms wear the brass key. Covers (when a
 * proprietor has hung one) show as a framed window in the door.
 * No fake lights — a plaque never lies.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { nav } from '@/src/utils/typedRouter';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, KeyRound, ChevronRight } from 'lucide-react-native';
import { LoungeRoom } from '@/src/stores/lounge';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';

export const PublicLoungeCard = React.memo(({ lounge, index: _index, onReport }: { lounge: LoungeRoom; index: number; onReport?: (lounge: LoungeRoom) => void }) => {
  const coverUrl = lounge.cover_image
    ? tmdb.backdrop(lounge.cover_image, 'w500')
    : null;

  return (
    <View style={s.cardWrapper}>
      <PressableScale
        style={s.publicCard}
        onPress={() => nav.push(`/lounge/${lounge.id}`)}
        onLongPress={onReport ? () => onReport(lounge) : undefined}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Enter salon ${lounge.name}${lounge.is_private ? ', approval required' : ''}`}
        accessibilityHint={onReport ? 'Long press to report this salon' : undefined}
      >
        <LinearGradient
          colors={[colors.sepia, 'rgba(107,79,15,0.6)']}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={s.publicAccentBar}
        />

        {coverUrl && (
          <View style={s.publicImgTop}>
            <Image source={{ uri: coverUrl }} style={s.publicImgContent} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={300} />
            <LinearGradient
              colors={['transparent', 'rgba(10,9,6,0.35)']}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}

        <View style={s.publicBody}>
          <View style={s.nameRow}>
            <Text style={s.publicName} numberOfLines={2}>{lounge.name}</Text>
            {lounge.is_private && (
              <View style={s.publicPrivateBadge}>
                <KeyRound size={9} color={colors.sepia} strokeWidth={1.5} />
                <Text style={s.publicPrivateText} numberOfLines={1}>BY REQUEST</Text>
              </View>
            )}
          </View>
          <Text style={s.publicDesc} numberOfLines={3}>
            {lounge.description || 'A cinematic gathering place.'}
          </Text>

          <View style={s.publicFooter}>
            <View style={s.publicMetaRow}>
              <Users size={11} color={colors.fog} strokeWidth={1.5} />
              <Text style={s.publicMetaText} numberOfLines={1}>{lounge.member_count || 0} SEATS TAKEN</Text>
            </View>
            <View style={s.publicEnterTag}>
              <Text style={s.publicEnterText} numberOfLines={1}>
                {lounge.is_private ? 'REQUEST A SEAT' : 'TAKE A SEAT'}
              </Text>
              <ChevronRight size={11} color={colors.sepia} strokeWidth={2} />
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
    marginBottom: 14,
  },
  publicCard: {
    padding: 16, paddingLeft: 20,
    backgroundColor: 'rgba(12,9,7,0.85)',
    borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: 4, position: 'relative',
    overflow: 'hidden',
    ...effects.shadowSurface,
  },
  publicAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    zIndex: 2,
  },
  publicImgTop: {
    width: '100%',
    height: 100,
    marginBottom: 14,
    borderRadius: 2,
    overflow: 'hidden',
    borderColor: colors.sepiaBorder,
    borderWidth: 1,
  },
  publicImgContent: { width: '100%', height: '100%' },
  publicBody: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  publicName: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.parchment,
    lineHeight: 24,
  },
  publicPrivateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    marginTop: 3,
  },
  publicPrivateText: {
    fontFamily: fonts.sub,
    fontSize: 6.5,
    letterSpacing: 1.5,
    color: colors.sepia,
    includeFontPadding: false,
  },
  publicDesc: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.bone,
    lineHeight: 19,
    marginBottom: 14,
    opacity: 0.85,
  },
  publicFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,137,26,0.12)',
    paddingTop: 12,
  },
  publicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  publicMetaText: {
    fontFamily: fonts.sub,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: colors.fog,
    includeFontPadding: false,
  },
  publicEnterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  publicEnterText: {
    fontFamily: fonts.sub,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: colors.sepia,
    includeFontPadding: false,
    flexShrink: 1,
  },
});
