import PressableScale from '@/src/components/PressableScale';
import { LoungeRoom, useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { LoungeMember } from '@/src/types/social.types';
import TactileEngine from '@/src/utils/TactileEngine';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ban, Crown, DoorClosed, Image as ImageIcon, LogOut, MoreHorizontal, Trash2, Users, Volume2, VolumeX, X } from 'lucide-react-native';
import { tmdb } from '@/src/lib/tmdb';
import React, { useCallback, useState } from 'react';
import { Alert, InteractionManager, Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedView = Animated.createAnimatedComponent(View);
const BLOOD = colors.crimson;

export interface LoungeSettingsPanelProps {
  lounge: LoungeRoom;
  members: LoungeMember[];
  visible: boolean;
  onClose: () => void;
  isCreator: boolean;
  onMembersChanged?: () => void;
}

export function LoungeSettingsPanel({ lounge, members, visible, onClose, isCreator, onMembersChanged }: LoungeSettingsPanelProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leaveLounge, deleteLounge, setMemberStatus, removeMember, setLoungeCover } = useLoungeStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Only approved/muted/banned are "members"; pending live in the At-the-Door panel.
  const roster = members.filter(m => m.status !== 'pending');

  const handleLeave = () => {
    Alert.alert('Step out of this salon?', 'You can rejoin a public salon any time; a private one needs the host to re-admit you.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Step out', style: 'destructive', onPress: async () => {
        TactileEngine.destroy();
        await leaveLounge(lounge.id);
        onClose();
        InteractionManager.runAfterInteractions(() => router.replace('/(tabs)/lounge' as never));
      }},
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Incinerate this salon?', 'All dispatches and member history will be permanently destroyed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Incinerate', style: 'destructive', onPress: async () => {
        TactileEngine.warn();
        await deleteLounge(lounge.id);
        onClose();
        InteractionManager.runAfterInteractions(() => router.replace('/(tabs)/lounge' as never));
      }},
    ]);
  };

  // ── Salon cover (host-only) ──
  // Hand off from this Modal to the route-modal picker AFTER it dismisses — the
  // same proven InteractionManager sequence used for leave/delete above, so we
  // never stack a Modal on a Modal (the Android-hostile pattern).
  const handleChangeCover = useCallback(() => {
    onClose();
    InteractionManager.runAfterInteractions(() => {
      (router.push as any)({ pathname: '/cover-picker', params: { loungeId: lounge.id } });
    });
  }, [onClose, router, lounge.id]);

  const handleRemoveCover = useCallback(() => {
    TactileEngine.selection();
    setLoungeCover(lounge.id, null);
  }, [setLoungeCover, lounge.id]);

  const confirmAction = useCallback((title: string, message: string, label: string, run: () => Promise<unknown>) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: async () => { TactileEngine.warn(); await run(); onMembersChanged?.(); } },
    ]);
  }, [onMembersChanged]);

  const renderMember = useCallback(({ item }: { item: LoungeMember }) => {
    const isFounder = item.user_id === lounge.creator_id;
    const isOpen = expanded === item.user_id;
    const muted = item.status === 'muted';
    const banned = item.status === 'banned';
    const uname = item.username?.toUpperCase();
    return (
      <View style={s.memberBlock}>
        <View style={s.memberRow}>
          <View style={s.memberAvatar}>
            {item.avatar_url
              ? <Image source={{ uri: item.avatar_url }} style={s.memberAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
              : <Users size={13} color={colors.fog} strokeWidth={1.5} />}
          </View>
          <Text style={s.memberName} numberOfLines={1}>@{uname}</Text>
          {muted && <View style={s.statusTag}><VolumeX size={9} color={colors.fog} strokeWidth={2} /><Text style={s.statusTagText}>MUTED</Text></View>}
          {banned && <View style={s.statusTag}><Ban size={9} color={BLOOD} strokeWidth={2} /><Text style={[s.statusTagText, { color: BLOOD }]}>BANNED</Text></View>}
          {isFounder ? (
            <View style={s.founderBadge}>
              <Crown size={9} color={colors.sepia} strokeWidth={2} />
              <Text style={s.founderText}>PROPRIETOR</Text>
            </View>
          ) : isCreator ? (
            <PressableScale onPress={() => setExpanded(isOpen ? null : item.user_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Member actions">
              <MoreHorizontal size={18} color={colors.fog} strokeWidth={1.5} />
            </PressableScale>
          ) : null}
        </View>

        {isCreator && !isFounder && isOpen && (
          <AnimatedView entering={SlideInDown.duration(160)} style={s.actionRow}>
            <PressableScale
              style={s.memberAction}
              haptic="selection"
              onPress={() => muted
                ? confirmAction('Unmute member?', `@${uname} will be able to post again.`, 'Unmute', () => setMemberStatus(lounge.id, item.user_id, 'approved'))
                : confirmAction('Mute member?', `@${uname} stays in the salon and can read, but can't post or react.`, 'Mute', () => setMemberStatus(lounge.id, item.user_id, 'muted'))}
            >
              {muted ? <Volume2 size={12} color={colors.fog} strokeWidth={1.5} /> : <VolumeX size={12} color={colors.fog} strokeWidth={1.5} />}
              <Text style={s.memberActionText}>{muted ? 'UNMUTE' : 'MUTE'}</Text>
            </PressableScale>

            <PressableScale
              style={s.memberAction}
              haptic="selection"
              onPress={() => confirmAction('Remove member?', `@${uname} will leave the salon. They can return later.`, 'Remove', () => removeMember(lounge.id, item.user_id))}
            >
              <DoorClosed size={12} color={BLOOD} strokeWidth={1.5} />
              <Text style={[s.memberActionText, { color: BLOOD }]}>REMOVE</Text>
            </PressableScale>

            <PressableScale
              style={[s.memberAction, s.memberActionBan]}
              haptic="selection"
              onPress={() => banned
                ? confirmAction('Lift the ban?', `@${uname} will be able to return.`, 'Unban', () => setMemberStatus(lounge.id, item.user_id, 'approved'))
                : confirmAction('Ban member?', `@${uname} will be removed and blocked from returning until you unban them.`, 'Ban', () => setMemberStatus(lounge.id, item.user_id, 'banned'))}
            >
              <Ban size={12} color={BLOOD} strokeWidth={1.5} />
              <Text style={[s.memberActionText, { color: BLOOD }]}>{banned ? 'UNBAN' : 'BAN'}</Text>
            </PressableScale>
          </AnimatedView>
        )}
      </View>
    );
  }, [lounge.creator_id, lounge.id, isCreator, expanded, setMemberStatus, removeMember, confirmAction]);

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill}>
        <PressableScale style={s.backdrop} onPress={onClose} accessibilityRole="button"><View /></PressableScale>
      </BlurView>
      <AnimatedView entering={SlideInDown.springify()} exiting={SlideOutDown} style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 28) }]}>
        <View style={s.handle} />
        <View style={s.headerRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={s.title} numberOfLines={1}>{lounge.name}</Text>
            {!!lounge.description && <Text style={s.subtitle} numberOfLines={2}>{lounge.description}</Text>}
          </View>
          <PressableScale onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.fog} strokeWidth={1.5} />
          </PressableScale>
        </View>

        <FlashList
          data={roster}
          keyExtractor={item => item.user_id}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={56}
          ListHeaderComponent={
            <View>
              {isCreator && (
                <View style={s.coverBlock}>
                  <Text style={s.label}>SALON COVER</Text>
                  {lounge.cover_image ? (
                    <View style={s.coverRow}>
                      <Image source={{ uri: tmdb.backdrop(lounge.cover_image, 'w500') }} style={s.coverThumb} contentFit="cover" cachePolicy="memory-disk" />
                      <View style={s.coverActions}>
                        <PressableScale style={s.coverBtn} onPress={handleChangeCover} haptic="selection" accessibilityRole="button" accessibilityLabel="Change salon cover"><Text style={s.coverBtnText}>CHANGE</Text></PressableScale>
                        <PressableScale style={[s.coverBtn, s.coverBtnRemove]} onPress={handleRemoveCover} haptic="selection" accessibilityRole="button" accessibilityLabel="Remove salon cover"><Text style={[s.coverBtnText, s.coverBtnTextRemove]}>REMOVE</Text></PressableScale>
                      </View>
                    </View>
                  ) : (
                    <PressableScale style={s.coverEmpty} onPress={handleChangeCover} haptic="selection" accessibilityRole="button" accessibilityLabel="Choose a salon cover">
                      <ImageIcon size={15} color={colors.sepia} strokeWidth={1.5} />
                      <Text style={s.coverEmptyText}>CHOOSE A FILM FOR THE COVER</Text>
                    </PressableScale>
                  )}
                </View>
              )}
              <Text style={s.label}>MEMBERS ({roster.length})</Text>
            </View>
          }
          renderItem={renderMember}
          ListFooterComponent={
            <View style={s.footer}>
              {isCreator ? (
                <PressableScale style={s.leaveBtn} onPress={handleDelete} accessibilityRole="button">
                  <Trash2 size={14} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.leaveText}>INCINERATE SALON</Text>
                </PressableScale>
              ) : (
                <PressableScale style={s.leaveBtn} onPress={handleLeave} accessibilityRole="button">
                  <LogOut size={14} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.leaveText}>STEP OUT OF SALON</Text>
                </PressableScale>
              )}
            </View>
          }
        />
      </AnimatedView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '85%', backgroundColor: colors.ink,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 28,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(184,137,26,0.15)',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },
  subtitle: { fontFamily: fonts.serif, fontSize: 13, color: colors.fog, marginTop: 4, lineHeight: 18 },
  label: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2.5, color: colors.sepia, opacity: 0.8, marginBottom: 12, includeFontPadding: false },

  memberBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.soot },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  memberAvatarImg: { width: '100%', height: '100%' },
  memberName: { flex: 1, fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.bone, includeFontPadding: false },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusTagText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
  founderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2,
    backgroundColor: 'rgba(184,137,26,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.2)',
  },
  founderText: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.5, color: colors.sepia, includeFontPadding: false },

  actionRow: { flexDirection: 'row', gap: 8, paddingBottom: 12, paddingLeft: 42 },
  memberAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    borderRadius: 7, paddingVertical: 7, paddingHorizontal: 11,
  },
  memberActionBan: { borderColor: colors.crimsonBorder },
  memberActionText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1, color: colors.fog, includeFontPadding: false },

  footer: { marginTop: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash, paddingTop: 20 },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, gap: 10 },
  leaveText: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },

  coverBlock: { marginBottom: 22 },
  coverRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  coverThumb: { width: 96, height: 54, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.25)' },
  coverActions: { flex: 1, flexDirection: 'row', gap: 8 },
  coverBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.25)' },
  coverBtnRemove: { borderColor: colors.crimsonBorder },
  coverBtnText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.5, color: colors.parchment, includeFontPadding: false },
  coverBtnTextRemove: { color: colors.crimson },
  coverEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 3, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.25)', backgroundColor: 'rgba(184,137,26,0.06)' },
  coverEmptyText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.sepia, includeFontPadding: false },
});
