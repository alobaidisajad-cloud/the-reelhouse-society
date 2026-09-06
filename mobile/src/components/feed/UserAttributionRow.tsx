import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';
import { RankBadge, rankOf } from '@/src/components/RankBadge';

interface Props {
  username: string;
  avatarUrl: string | null | undefined;
  role: string | null | undefined;
  timeAgo: string;
  onUserPress: () => void;
}

// Tier-aware ledger rules — premium members' cards are filed on better paper.
const RULE_DEFAULT = ['rgba(184,137,26,0.18)', 'rgba(184,137,26,0.02)'] as const;
const RULE_ARCHIVIST = ['rgba(184,137,26,0.55)', 'rgba(184,137,26,0.02)'] as const;
const RULE_AUTEUR = ['rgba(180,45,45,0.55)', 'rgba(180,45,45,0.02)'] as const;

/**
 * The ledger row — top of the archive index card.
 * Who filed it: avatar, @handle, tier crest, timestamp; a ruled tier line
 * beneath. Single fixed height for every username/tier combination:
 * the handle shrinks with ellipsis, crest and timestamp never move.
 */
export const UserAttributionRow = React.memo(function UserAttributionRow({ username, avatarUrl, role, timeAgo, onUserPress }: Props) {
  const isArchivist = isArchivistPlusTier(role) && !isAuteurPlusTier(role);
  const isAuteur = isAuteurPlusTier(role);
  const ruleColors = isAuteur ? RULE_AUTEUR : isArchivist ? RULE_ARCHIVIST : RULE_DEFAULT;

  return (
    <View>
      <View style={s.row}>
        <PressableScale onPress={onUserPress} hitSlop={s.hitSlop} haptic="selection" pressedScale={0.96} style={s.pressable} accessibilityLabel={`View profile of @${username}`}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.avatar} cachePolicy="memory-disk" transition={150} />
          ) : (
            <View style={s.avatar}>
              <Text style={s.avatarText}>{username.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.username} numberOfLines={1} ellipsizeMode="tail">
            @{username.toUpperCase()}
          </Text>
        </PressableScale>
        {/* The house's badge, drawn once and imported. This file used to hold
            its own copy — and the app ended up with three golds for one rank,
            because four surfaces each solved this separately. The Auteur's
            plate is the brass RAMP now, not a flat fill: `oneBrass` named this
            badge as its one known violation of that rule and left it for
            whoever owned the four surfaces to convert. */}
        <RankBadge rank={rankOf(role)} />
        <Text style={s.timestamp} numberOfLines={1}>
          {timeAgo}
        </Text>
      </View>
      <LinearGradient
        colors={ruleColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.tierRule}
      />
    </View>
  );
});

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
    // NO flexWrap — the ledger row is one line, always. The handle shrinks;
    // the crest and timestamp hold their ground.
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  hitSlop: { top: 15, bottom: 15, left: 15, right: 15 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.soot,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    overflow: 'hidden',
  },
  avatarText: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.display,
    fontSize: 12,
    color: colors.parchment,
  },
  username: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.sepia,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  timestamp: {
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.fog,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  tierRule: {
    height: 1,
  },
});
