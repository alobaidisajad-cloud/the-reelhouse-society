import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';

interface Props {
  username: string;
  avatarUrl: string | null | undefined;
  role: string | null | undefined;
  timeAgo: string;
  onUserPress: () => void;
}

/**
 * User attribution row at the bottom of an ActivityCard.
 * Shows avatar, username, role badge, and timestamp.
 */
export const UserAttributionRow = React.memo(function UserAttributionRow({ username, avatarUrl, role, timeAgo, onUserPress }: Props) {
  const isArchivist = isArchivistPlusTier(role) && !isAuteurPlusTier(role);
  const isAuteur = isAuteurPlusTier(role);

  return (
    <View style={s.row}>
      <View style={s.inner}>
        <PressableScale onPress={onUserPress} hitSlop={s.hitSlop} haptic="selection" pressedScale={0.96} style={s.pressable} accessibilityLabel={`View profile of @${username}`}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} cachePolicy="memory-disk" />
          ) : (
            <View style={s.avatar}>
              <Text style={s.avatarText}>{username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.username} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            @{username.toUpperCase()}
          </Text>
        </PressableScale>
        {isArchivist && (
          <Text style={s.badgeArchivist} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            ✦ ARCHIVIST
          </Text>
        )}
        {isAuteur && (
          <Text style={s.badgeAuteur} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            ★ AUTEUR
          </Text>
        )}
      </View>
      <Text style={s.timestamp} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {timeAgo}
      </Text>
    </View>
  );
});

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  hitSlop: { top: 15, bottom: 15, left: 15, right: 15 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.soot,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
  },
  avatarText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.display,
    fontSize: 14,
    color: colors.parchment,
  },
  username: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.ui,
    fontSize: 12,
    letterSpacing: 1.8,
    color: colors.sepia,
    textTransform: 'uppercase',
  },
  badgeArchivist: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.ui,
    fontSize: 6, // 10/10 D-01: membership badge — matches live card sizing
    letterSpacing: 1,
    color: colors.sepia,
    backgroundColor: 'rgba(139,105,20,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
  },
  badgeAuteur: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.ui,
    fontSize: 6.5, // 10/10 D-01: membership badge — matches live card sizing
    letterSpacing: 1,
    color: colors.ink,
    backgroundColor: '#DAA520',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 2,
  },
  timestamp: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.fog,
  },
});
