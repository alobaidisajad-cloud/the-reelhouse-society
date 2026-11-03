import React from 'react';
import { RemoteImage } from '@/src/components/Picture';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { MoreHorizontal } from 'lucide-react-native';
import { initialOf } from '@/src/utils/text';
import { isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';
import { RankBadge, rankOf } from '@/src/components/RankBadge';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

interface Props {
  username: string;
  avatarUrl: string | null | undefined;
  role: string | null | undefined;
  timeAgo: string;
  onUserPress: () => void;
  /** The ruled line under it; the Reel's frame says the rank by its stock and draws none. */
  ruled?: boolean;
  /** The name's ink: the house's brass, or the frame's own accent. */
  nameInk?: string;
  /** Another member's log: ··· at the name line's end, the Tribunal's sheet. */
  onMore?: () => void;
}

// Tier-aware ledger rules — premium members' cards are filed on better paper.
const RULE_DEFAULT = ['rgba(184,137,26,0.18)', 'rgba(184,137,26,0.02)'] as const;
const RULE_ARCHIVIST = ['rgba(184,137,26,0.55)', 'rgba(184,137,26,0.02)'] as const;
const RULE_AUTEUR = ['rgba(180,45,45,0.55)', 'rgba(180,45,45,0.02)'] as const;

/** The avatar's side, and the gap between each thing on a line. */
const AVATAR = 28;
/** ···'s halo: up and down to a finger, sideways no further than its own width. */
const MORE_SLOP = { top: 10, bottom: 10, left: 0, right: 0 };
/** The name beside a ···: it reaches no further right than its own box, so a long name never takes the ···'s touches. */
const NAME_BESIDE_MORE = { top: 15, bottom: 15, left: 15, right: 0 };
const GAP = 8;

/**
 * The ledger row — top of the archive index card.
 * Who filed it: avatar, @handle, tier crest, timestamp; a ruled tier line
 * beneath. One height for every username/tier combination at a text size.
 *
 * Two lines at every text size: the name alone on the first, past the avatar,
 * the rank and the time beneath it. On one line the name had what the rank and
 * the time left it: "@E2E_WRITER", eleven letters, lost its end on the film
 * page at Android's largest text, and a fifteen-letter name beside a rank lost
 * 42 to 78pt at the designed size on a 320pt phone, 16 to 38pt on a 360pt one
 * (mockups/tools/layout.cjs --kinds NAME). A handle longer than its line ends in …
 */
export const UserAttributionRow = React.memo(function UserAttributionRow({ username, avatarUrl, role, timeAgo, onUserPress, ruled = true, nameInk, onMore }: Props) {
  const isArchivist = isArchivistPlusTier(role) && !isAuteurPlusTier(role);
  const isAuteur = isAuteurPlusTier(role);
  const ruleColors = isAuteur ? RULE_AUTEUR : isArchivist ? RULE_ARCHIVIST : RULE_DEFAULT;

  return (
    <View>
      <View style={[s.row, s.nameLine]}>
        <PressableScale room onPress={onUserPress} hitSlop={onMore ? NAME_BESIDE_MORE : s.hitSlop} haptic="selection" pressedScale={0.96} style={s.pressable} accessibilityLabel={`View profile of @${username}`}>
          <RemoteImage uri={avatarUrl} style={s.avatar} transition={150} fallback={<View style={s.avatar}>
              <Text style={s.avatarText} {...UNSPOKEN}>{initialOf(username)}</Text>
            </View>} />
          <Text style={[s.username, nameInk ? { color: nameInk } : null]} numberOfLines={1} ellipsizeMode="tail">
            @{username.toUpperCase()}
          </Text>
        </PressableScale>
        {onMore ? (
          <PressableScale room onPress={onMore} hitSlop={MORE_SLOP} haptic="selection" style={s.more} accessibilityRole="button" accessibilityLabel={`More for @${username}'s log`} accessibilityHint="Report, block, or mute this member">
            <MoreHorizontal size={16} strokeWidth={2} color={colors.fog} />
          </PressableScale>
        ) : null}
      </View>
      <View style={[s.row, s.factsLine]}>
        {/* The house's one badge, imported: one brass for one rank, everywhere. */}
        <RankBadge rank={rankOf(role)} />
        <Text style={s.timestamp} numberOfLines={1}>
          {timeAgo}
        </Text>
      </View>
      {ruled ? (
        <LinearGradient
          colors={ruleColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={s.tierRule}
        />
      ) : null}
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
  // The facts sit close under the name (2pt, not the row's 10pt foot), starting
  // where the handle does, past the avatar and its gap.
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
  // At the name line's end, a finger's 48 across: it reaches the frame's edge (its pad, 14), never the name.
  more: { marginLeft: 'auto', marginRight: -14, width: 48, alignItems: 'center', justifyContent: 'center' },
});
