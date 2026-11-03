import React from 'react';
import { RemoteImage } from '@/src/components/Picture';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { initialOf } from '@/src/utils/text';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';
import { RankBadge, rankOf } from '@/src/components/RankBadge';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { useTextScale } from '@/src/hooks/useTextScale';

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

/** The avatar's side, and the gap between each thing on a line. */
const AVATAR = 28;
const GAP = 8;

/**
 * Above the size it was designed at, the byline is two lines: the name alone on the first, the
 * rank and the time beneath it. On one line the name has what the rank and the time leave it, and
 * that room is measured at the designed size: "@E2E_WRITER", eleven letters, lost its end on the
 * film page at Android's largest text (112.7pt of name for 110.1pt), and a fourteen-letter name
 * beside a rank, whole at the designed size on the narrowest phone (360pt), lost 5pt at 1.04,
 * 21pt at 1.12 and 66pt at 1.35 (mockups/tools/layout.cjs).
 */
export const STACK_ABOVE = 1;

/**
 * The ledger row — top of the archive index card.
 * Who filed it: avatar, @handle, tier crest, timestamp; a ruled tier line
 * beneath. One height for every username/tier combination at a text size:
 * the handle shrinks with ellipsis, crest and timestamp never move. Larger
 * than designed (STACK_ABOVE), the crest and timestamp step down a line,
 * under the handle, and the handle has the whole width.
 */
export const UserAttributionRow = React.memo(function UserAttributionRow({ username, avatarUrl, role, timeAgo, onUserPress }: Props) {
  const isArchivist = isArchivistPlusTier(role) && !isAuteurPlusTier(role);
  const isAuteur = isAuteurPlusTier(role);
  const ruleColors = isAuteur ? RULE_AUTEUR : isArchivist ? RULE_ARCHIVIST : RULE_DEFAULT;
  const stacked = useTextScale() > STACK_ABOVE;
  const facts = (
    <>
      {/* The house's one badge, imported: one brass for one rank, everywhere. */}
      <RankBadge rank={rankOf(role)} />
      <Text style={s.timestamp} numberOfLines={1}>
        {timeAgo}
      </Text>
    </>
  );

  return (
    <View>
      <View style={[s.row, stacked && s.nameLine]}>
        <PressableScale room onPress={onUserPress} hitSlop={s.hitSlop} haptic="selection" pressedScale={0.96} style={s.pressable} accessibilityLabel={`View profile of @${username}`}>
          <RemoteImage uri={avatarUrl} style={s.avatar} transition={150} fallback={<View style={s.avatar}>
              <Text style={s.avatarText} {...UNSPOKEN}>{initialOf(username)}</Text>
            </View>} />
          <Text style={s.username} numberOfLines={1} ellipsizeMode="tail">
            @{username.toUpperCase()}
          </Text>
        </PressableScale>
        {!stacked && facts}
      </View>
      {stacked && <View style={[s.row, s.factsLine]}>{facts}</View>}
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
    gap: GAP,
    paddingBottom: 10,
    // NO flexWrap — each line of the ledger is one line, always. The handle
    // shrinks; the crest and timestamp hold their ground.
  },
  // Stacked (STACK_ABOVE): the facts sit close under the name (2pt, not the row's
  // 10pt foot), starting where the handle does, past the avatar and its gap.
  nameLine: {
    paddingBottom: 2,
  },
  factsLine: {
    paddingLeft: AVATAR + GAP,
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
    flexShrink: 1,
  },
  hitSlop: { top: 15, bottom: 15, left: 15, right: 15 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
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
    fontSize: 10,
    letterSpacing: 1,
    color: colors.fog,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  tierRule: {
    height: 1,
  },
});
