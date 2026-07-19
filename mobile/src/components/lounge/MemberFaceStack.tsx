/**
 * MemberFaceStack — the bounded avatar cluster on a salon card.
 * ─────────────────────────────────────────────────────────────
 * RELIABILITY BY CONSTRUCTION. Every dimension is fixed; nothing scales,
 * shrinks, wraps, or depends on how many members a salon has:
 *   · at most 3 faces, always (a 2-member and a 200-member salon are identical)
 *   · the "+N" overflow comes from member_count (already reliable), NOT from
 *     the fetched faces, and its digits are capped ("999+") so its width is bounded
 *   · fixed 22px avatars, fixed −7px overlap, no zIndex (later sibling paints on
 *     top — the reel-page stacking law: never animate/fight over z-order)
 *   · overflow:hidden on the row as a final guard so nothing can ever spill
 *   · a member with no photo → their initial in a brass ring, never an empty circle
 *   · NO faces at all (fetch failed / not yet loaded) → the original "👥 N"
 *     count in the same spot: worst case is exactly today's card.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Users, Lock } from 'lucide-react-native';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';

export interface SalonFace {
  username: string;
  avatar_url: string | null;
}

const AVATAR = 22;
const OVERLAP = 7;
const MAX_FACES = 3;

/** Pure, unit-tested layout model — the reliability core. */
export function buildFaceStackModel(
  faces: SalonFace[] | undefined,
  totalCount: number | undefined,
  maxFaces: number = MAX_FACES
): { shown: SalonFace[]; overflow: number; overflowLabel: string | null } {
  const shown = (faces ?? []).slice(0, maxFaces);
  const total = typeof totalCount === 'number' ? totalCount : shown.length;
  const overflow = Math.max(0, total - shown.length);
  const overflowLabel = overflow <= 0 ? null : overflow > 999 ? '999+' : `+${overflow}`;
  return { shown, overflow, overflowLabel };
}

function initialOf(username: string): string {
  return (username || '?').trim().charAt(0).toUpperCase() || '?';
}

export const MemberFaceStack = React.memo(function MemberFaceStack({
  faces,
  totalCount,
  isPrivate,
}: {
  faces?: SalonFace[];
  totalCount?: number;
  isPrivate?: boolean;
}) {
  const { shown, overflowLabel } = buildFaceStackModel(faces, totalCount);

  // Fallback: no faces available → today's plain count, same footprint.
  if (shown.length === 0) {
    return (
      <View style={s.row}>
        <Users size={11} color={colors.fog} strokeWidth={1.5} />
        <Text style={s.count} numberOfLines={1}>{totalCount ?? 0}</Text>
        {isPrivate && <Lock size={10} color={colors.sepia} strokeWidth={1.5} style={s.lock} />}
      </View>
    );
  }

  return (
    <View style={s.row}>
      <View style={s.stack}>
        {shown.map((f, i) => (
          <View key={`${f.username}-${i}`} style={[s.avatar, i > 0 && s.avatarOverlap]}>
            {f.avatar_url ? (
              <Image
                source={{ uri: f.avatar_url }}
                style={s.avatarImg}
                contentFit="cover"
                cachePolicy="memory-disk"
                placeholder={{ blurhash: SEPIA_HASH }}
                transition={150}
                recyclingKey={f.username}
              />
            ) : (
              <Text style={s.initial}>{initialOf(f.username)}</Text>
            )}
          </View>
        ))}
      </View>
      {overflowLabel && <Text style={s.overflow} numberOfLines={1}>{overflowLabel}</Text>}
      {isPrivate && <Lock size={10} color={colors.sepia} strokeWidth={1.5} style={s.lock} />}
    </View>
  );
});

const s = StyleSheet.create({
  // overflow:hidden = the final guard; the cluster can never spill past the card.
  row: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    borderWidth: 1.5, borderColor: colors.champagne,
    backgroundColor: colors.soot, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlap: { marginLeft: -OVERLAP },
  avatarImg: { width: '100%', height: '100%' },
  initial: { fontFamily: fonts.display, fontSize: 9, color: colors.parchment, includeFontPadding: false },
  overflow: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, marginLeft: 7, includeFontPadding: false },
  count: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, color: colors.fog, marginLeft: 7, includeFontPadding: false },
  lock: { marginLeft: 6 },
});
