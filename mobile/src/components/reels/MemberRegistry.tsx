/**
 * MemberRegistry — "✦ THE MEMBER REGISTRY ✦"
 * ─────────────────────────────────────────────────────────────
 * Shown ONLY inside the empty following-feed (see reels.tsx). Introduces
 * a newcomer to the House's most-followed public members so their orbit is
 * never a dead end. Retires itself the moment the feed has content.
 *
 * The row mirrors SearchResultRow, and the FOLLOW stamp the profile page's
 * follow button states. Two separate touch targets — row → profile,
 * stamp → follow — so neither gesture is ambiguous.
 *
 * Every failure path degrades to rendering nothing: the empty state simply
 * stays exactly as it was.
 */
import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { Image } from 'expo-image';
import { User } from 'lucide-react-native';
import { nav } from '@/src/utils/typedRouter';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import TactileEngine from '@/src/utils/TactileEngine';
import { useNotableMembers } from '@/src/hooks/useNotableMembers';
import type { NotableMember } from '@/src/services/MemberDiscoveryService';
import { useAuthStore } from '@/src/stores/auth';
import { useSocialStore } from '@/src/stores/followStore';
import { useBlockStore } from '@/src/stores/blockStore';
import { followUser } from '@/src/stores/domain/socialSlice';
import { RankBadge, rankOf } from '@/src/components/RankBadge';

const MAX_ROWS = 6;

/**
 * Pure exclusion core (unit-tested): drop self, already-followed, blocked,
 * and username-less rows; cap at MAX_ROWS. Kept side-effect-free so the
 * registry's most important guarantee — never suggest someone you shouldn't —
 * is verifiable without rendering.
 */
export function selectRegistryMembers(
  data: NotableMember[] | undefined,
  opts: { myId: string | undefined; followingLower: Set<string>; isBlocked: (id: string) => boolean }
): NotableMember[] {
  if (!data || data.length === 0) return [];
  return data
    .filter((m) =>
      !!m.username &&
      m.id !== opts.myId &&
      !opts.followingLower.has(m.username.toLowerCase()) &&
      !opts.isBlocked(m.id)
    )
    .slice(0, MAX_ROWS);
}

function MemberRow({ member }: { member: NotableMember }) {
  // Follow state is read from the store (single source of truth), so the
  // stamp can never show a wrong state.
  const isFollowing = useSocialStore((s) => s.isFollowing(member.username));
  const isRequested = useSocialStore((s) => s.isRequested(member.username));

  const serial = member.member_no ? `Nº ${String(member.member_no).padStart(4, '0')}` : null;

  const goToProfile = useCallback(() => {
    nav.push(`/user/${member.username}`);
  }, [member.username]);

  const onFollow = useCallback(() => {
    if (isFollowing || isRequested) return;
    TactileEngine.selection();
    // The store marks the follow at once and refreshes the feed itself, for every follow surface.
    followUser(member.username)
      .catch(() => { /* socialSlice already rolls back + toasts on failure */ });
  }, [member.username, isFollowing, isRequested]);

  const followed = isFollowing || isRequested;

  return (
    <View style={s.row}>
      <PressableScale
        style={s.rowMain}
        onPress={goToProfile}
        haptic="light"
        pressedScale={0.98}
        accessibilityRole="button"
        accessibilityLabel={`View @${member.username}'s profile`}
      >
        <View style={s.avatar}>
          {member.avatar_url ? (
            <Image source={{ uri: member.avatar_url }} style={s.avatarImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={150} />
          ) : (
            <View style={s.avatarEmpty}><User size={16} color={colors.fog} /></View>
          )}
        </View>

        <View style={s.rowText}>
          <Text style={s.name} numberOfLines={1}>@{member.username.toUpperCase()}</Text>
          {/* The house's mark; an unranked member shows their number and nothing else. */}
          <View style={s.rankRow}>
            <RankBadge rank={rankOf({ role: member.role, is_founding: member.is_founding })} />
            {serial ? <Text style={s.serial} numberOfLines={1}>{serial}</Text> : null}
          </View>
        </View>
      </PressableScale>

      <PressableScale
        style={[s.stamp, followed && s.stampDone]}
        onPress={onFollow}
        disabled={followed}
        haptic="selection"
        pressedScale={0.94}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={followed ? `Following @${member.username}` : `Follow @${member.username}`}
      >
        <Text style={[s.stampText, followed && s.stampTextDone]} numberOfLines={1}>
          {isFollowing ? '✦ FOLLOWED' : isRequested ? 'REQUESTED' : 'FOLLOW'}
        </Text>
      </PressableScale>
    </View>
  );
}

export function MemberRegistry({ visible }: { visible: boolean }) {
  const { data } = useNotableMembers(visible);
  const myId = useAuthStore((st) => st.user?.id);
  const following = useSocialStore((st) => st.following);
  const blockedVersion = useBlockStore((st) => st._blockedIndex);

  const members = useMemo(() => {
    const followingLower = new Set(following.map((u) => (u || '').toLowerCase()));
    return selectRegistryMembers(data, { myId, followingLower, isBlocked: useBlockStore.getState().isBlocked });
    // blockedVersion in deps so re-filter runs if the block set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, myId, following, blockedVersion]);

  // Nothing notable to show: the empty state stands alone.
  if (!visible || members.length === 0) return null;

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <View style={s.headerLine} />
        <Text style={s.headerText}>✦ THE MEMBER REGISTRY ✦</Text>
        <View style={s.headerLine} />
      </View>
      <Text style={s.subtitle}>Notable patrons of the House.</Text>

      <View style={s.list}>
        {members.map((m) => <MemberRow key={m.id} member={m} />)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: '100%', marginTop: 28, paddingHorizontal: 16 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  headerLine: { flex: 1, height: 1, backgroundColor: colors.sepia, opacity: 0.25 },
  headerText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia },
  // Solid fogQuiet, as `serial` below: no word borrows its contrast from the ground.
  subtitle: { fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fogQuiet, textAlign: 'center', marginBottom: 12 },

  list: {},
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(184,137,26,0.1)',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },

  avatar: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(196,150,26,0.5)', marginRight: 12,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },

  rowText: { flex: 1 },
  name: { fontFamily: fonts.body, fontSize: 12, color: colors.parchment, letterSpacing: 0.5, marginBottom: 2 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  serial: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 0.6, color: colors.fogQuiet },

  stamp: {
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.45)',
    borderRadius: 2, paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: 'rgba(184,137,26,0.05)', marginLeft: 8,
  },
  stampDone: { borderStyle: 'solid', borderColor: 'rgba(184,137,26,0.3)', backgroundColor: 'rgba(184,137,26,0.12)' },
  stampText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.sepia },
  stampTextDone: { color: colors.sepia, opacity: 0.9 },
});
