import { useShallow } from 'zustand/react/shallow';
import PressableScale from '@/src/components/PressableScale';
import { InColumn, useWindowFill } from '@/src/components/layout/InColumn';
import { RemoteImage, PosterMark } from '@/src/components/Picture';
import { LoungeRoom, useLoungeStore } from '@/src/stores/lounge';
import { colors, fonts } from '@/src/theme/theme';
import { LoungeMember } from '@/src/types/social.types';
import TactileEngine from '@/src/utils/TactileEngine';
import { FlashList } from '@shopify/flash-list';
import { NOT_ANCHORED } from '@/src/components/layout/CinematicFlashList';
import { HouseBlur } from '@/src/components/HouseBlur';
import { Ban, Crown, DoorClosed, Image as ImageIcon, LogOut, MoreHorizontal, Trash2, Users, Volume2, VolumeX, X } from 'lucide-react-native';
import { tmdb } from '@/src/lib/tmdb';
import React, { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, InteractionManager, Modal, StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import { useStruck } from '@/src/components/StruckWords';
import { ToastHost } from '@/src/components/ToastHost';
import { leave, MS } from '@/src/theme/motion';
import { Arrive } from '@/src/components/Arrive';
import { Presence, PresenceView } from '@/src/components/motion/Presence';
import { nav } from '@/src/utils/typedRouter';
import { useSheetBottom } from '@/src/components/layout/navMetrics';
import { TryAgainLine } from '@/src/components/TryAgain';
import type { RoomStanding } from '@/src/components/lounge/roomGate';
import { isRTLText } from '@/src/utils/text';
import { rtlText } from '@/src/components/profile/roomStyles';

const BLOOD = colors.crimson;
/** The same red as WORDS — BANNED, REMOVE, BAN. The pigment is 2.78:1 as a word. */
const BLOOD_INK = colors.crimsonInk;

export interface LoungeSettingsPanelProps {
  lounge: LoungeRoom;
  members: LoungeMember[];
  visible: boolean;
  onClose: () => void;
  isCreator: boolean;
  /** The member's standing as the room holds it (its own judge of the seat), read or known from the corridor. */
  standing: RoomStanding;
  /** The room's last roster read failed. */
  rosterFailed?: boolean;
  /** Reads the roster again. */
  onRetryRoster?: () => void;
  onMembersChanged?: () => void;
}

export function LoungeSettingsPanel({ lounge, members, visible, onClose, isCreator, standing, rosterFailed = false, onRetryRoster, onMembersChanged }: LoungeSettingsPanelProps) {
  const sheetFoot = useSheetBottom();
  // The room's name and description, each slur struck for a reader who asked (StruckWords).
  const struck = useStruck();
  const { leaveLounge, deleteLounge, setMemberStatus, removeMember, setLoungeCover } = useLoungeStore(useShallow((s) => ({ leaveLounge: s.leaveLounge, deleteLounge: s.deleteLounge, setMemberStatus: s.setMemberStatus, removeMember: s.removeMember, setLoungeCover: s.setLoungeCover })));
  const [expanded, setExpanded] = useState<string | null>(null);
  /** The room still stands: a way home deferred past the alert never pops a screen the member has since gone to. */
  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);
  // The scrim reaches the window’s edges on a wide window (InColumn): the room lit around the
  // column dims with the page.
  const fill = useWindowFill();

  // Only approved/muted/banned are "members"; pending live in the At-the-Door panel.
  const roster = members.filter(m => m.status !== 'pending');
  // The seat is judged by the room's standing, the one the room itself acts on: judged from the roster's
  // rows, a seated member who opened the sheet before the roster was read, or after the read failed,
  // was told "The roster is kept for those seated." and offered no STEP OUT (review round 12).
  // The roster the house gives: the host's and the seated's (a muted member keeps their seat). Anyone
  // else is given their own row at most, and the sheet said "MEMBERS (1)" over a full salon, and
  // offered a guest STEP OUT of a seat they never held (review round 10). They are told the salon's
  // own count, and step out only of a row they hold (a request at the door included).
  const seated = isCreator || standing === 'approved' || standing === 'muted';
  // A roster read holds the reader's own row: none yet is a roster not read.
  const rosterRead = members.length > 0;
  const readsRoster = seated && rosterRead;
  // Not yet known (the corridor does not know it, the roster unread): never told it is a guest.
  const rosterAwaited = (seated || standing === 'unknown') && !rosterRead;
  // The reader the host has banned holds no seat to step out of: stepping out took their row, and the
  // host's UNBAN with it, while the ban stood (review round 9).
  const holdsARow = standing === 'approved' || standing === 'muted' || standing === 'pending';

  const handleLeave = () => {
    Alert.alert('Step out of this salon?', 'You can rejoin a public salon any time; a private one needs the host to re-admit you.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Step out', style: 'destructive', onPress: async () => {
        TactileEngine.destroy();
        // Only once out: a refused leave is said by the store, and the room stays.
        if (!(await leaveLounge(lounge.id))) return;
        onClose();
        InteractionManager.runAfterInteractions(() => { if (isMounted.current) nav.dismissTo('/(tabs)/lounge'); });
      }},
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Incinerate this salon?', 'All dispatches and member history will be permanently destroyed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Incinerate', style: 'destructive', onPress: async () => {
        TactileEngine.warn();
        // A salon the house would not destroy is still standing: its host stays in it.
        if (!(await deleteLounge(lounge.id))) return;
        onClose();
        InteractionManager.runAfterInteractions(() => { if (isMounted.current) nav.dismissTo('/(tabs)/lounge'); });
      }},
    ]);
  };

  // ── Salon cover (host-only) ──
  // The Concierge's presentation law: the picker (a route modal) is asked for only once this
  // sheet (an RN Modal) is gone from the screen. Asked while it was still sliding away, iOS was
  // asked to present one sheet while another left, and the picker could fail to appear. The
  // trip is parked, and taken as the sheet's contents leave the screen, or by a backstop if its
  // exit never ends.
  const coverPending = useRef(false);
  const toCover = useCallback(() => {
    // A salon gone from the screen takes no trip: the member has left it.
    if (!coverPending.current || !isMounted.current) return;
    coverPending.current = false;
    nav.push('/cover-picker', { loungeId: lounge.id });
  }, [lounge.id]);
  const handleChangeCover = useCallback(() => {
    coverPending.current = true;
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (visible || !coverPending.current) return undefined;
    const t = setTimeout(toCover, COVER_BACKSTOP_MS);
    return () => clearTimeout(t);
  }, [visible, toCover]);

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
            <RemoteImage uri={item.avatar_url} style={s.memberAvatarImg} contentFit="cover" transition={150} fallback={<Users size={13} color={colors.fog} strokeWidth={1.5} />} />
          </View>
          <Text style={s.memberName} numberOfLines={1}>@{uname}</Text>
          {muted && <View style={s.statusTag}><VolumeX size={9} color={colors.fog} strokeWidth={2} /><Text style={s.statusTagText}>MUTED</Text></View>}
          {banned && <View style={s.statusTag}><Ban size={9} color={BLOOD} strokeWidth={2} /><Text style={[s.statusTagText, { color: BLOOD_INK }]}>BANNED</Text></View>}
          {isFounder ? (
            <View style={s.founderBadge}>
              <Crown size={9} color={colors.sepia} strokeWidth={2} />
              <Text style={s.founderText}>PROPRIETOR</Text>
            </View>
          ) : isCreator ? (
            // A 48pt box with the mark where it was drawn, at its right edge: it takes the gap before
            // it, and reaches into the row's padding without moving the row.
            <PressableScale style={s.memberMore} hitSlop={null} onPress={() => setExpanded(isOpen ? null : item.user_id)} haptic="selection" accessibilityRole="button" accessibilityLabel="Member actions">
              <MoreHorizontal size={18} color={colors.fog} strokeWidth={1.5} />
            </PressableScale>
          ) : null}
        </View>

        {isCreator && !isFounder && isOpen && (
          <Arrive name="lounge.member-acts" duration={160} rise={8} style={s.actionRow}>
            {/* Each act grown to 48 up and down, drawn as it was: its halo there stopped at the 39pt row.
                Across, half the 8pt gap to its neighbour. */}
            <PressableScale room="vertical" hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }}
              style={s.memberAction}
              haptic="selection"
              onPress={() => muted
                ? confirmAction('Unmute member?', `@${uname} will be able to post again.`, 'Unmute', () => setMemberStatus(lounge.id, item.user_id, 'approved'))
                : confirmAction('Mute member?', `@${uname} stays in the salon and can read, but can't post or react.`, 'Mute', () => setMemberStatus(lounge.id, item.user_id, 'muted'))}
            >
              {muted ? <Volume2 size={12} color={colors.fog} strokeWidth={1.5} /> : <VolumeX size={12} color={colors.fog} strokeWidth={1.5} />}
              <Text style={s.memberActionText}>{muted ? 'UNMUTE' : 'MUTE'}</Text>
            </PressableScale>

            {/* Not over a ban: the banned hold no seat to be removed from, and the removal took their row,
                and UNBAN with it, while the ban stood (review round 9). */}
            {banned ? null : (
            <PressableScale room="vertical" hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }}
              style={s.memberAction}
              haptic="selection"
              onPress={() => confirmAction('Remove member?', `@${uname} will leave the salon. They can return later.`, 'Remove', () => removeMember(lounge.id, item.user_id))}
            >
              <DoorClosed size={12} color={BLOOD} strokeWidth={1.5} />
              <Text style={[s.memberActionText, { color: BLOOD_INK }]}>REMOVE</Text>
            </PressableScale>
            )}

            <PressableScale room="vertical" hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }}
              style={[s.memberAction, s.memberActionBan]}
              haptic="selection"
              onPress={() => banned
                ? confirmAction('Lift the ban?', `@${uname} will be able to return.`, 'Unban', () => setMemberStatus(lounge.id, item.user_id, 'approved'))
                : confirmAction('Ban member?', `@${uname} will be removed and blocked from returning until you unban them.`, 'Ban', () => setMemberStatus(lounge.id, item.user_id, 'banned'))}
            >
              <Ban size={12} color={BLOOD} strokeWidth={1.5} />
              <Text style={[s.memberActionText, { color: BLOOD_INK }]}>{banned ? 'UNBAN' : 'BAN'}</Text>
            </PressableScale>
          </Arrive>
        )}
      </View>
    );
  }, [lounge.creator_id, lounge.id, isCreator, expanded, setMemberStatus, removeMember, confirmAction]);

  // Kept open while the sheet slides away.
  return (
    <Presence>
    {visible ? (
    <Modal key="settings" statusBarTranslucent transparent visible animationType="fade" onRequestClose={onClose}>
      <InColumn>
      <HouseBlur intensity={50} tint="dark" style={fill}>
        {/* The ground closes it for a finger; a screen reader has the named Close. */}
        <PressableScale style={s.backdrop} onPress={onClose} accessible={false} importantForAccessibility="no-hide-descendants"><View /></PressableScale>
      </HouseBlur>
      {/* Arrive, rising from below, not a mount-time `entering` that can stall. */}
      <PresenceView name="lounge.settings.leave" style={s.frame} pointerEvents="box-none"
        exit={{ kind: 'SlideOutDown', duration: MS.quick, easing: leave() }}>
      <Arrive name="lounge.settings" duration={MS.considered} rise={SETTINGS_RISE} style={[s.sheet, { paddingBottom: sheetFoot }]}>
      <View style={s.body} onAccessibilityEscape={onClose}>
        <WhenGone run={() => { if (coverPending.current) requestAnimationFrame(toCover); }} />
        <View style={s.handle} />
        <View style={s.headerRow}>
          {/* The room's name and description are drawn whole here, the one place every member
              and a public salon's visitor can read them: the cards, the room's header and the
              ALL SALONS row cut them. The name stays with the X; the description scrolls with the
              roster, so 300 characters never crowd it out. */}
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={s.title}>{struck(lounge.name)}</Text>
          </View>
          <PressableScale touch="wayOut" onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} haptic="selection" accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.fog} strokeWidth={1.5} />
          </PressableScale>
        </View>

        <FlashList
          data={readsRoster ? roster : []}
          maintainVisibleContentPosition={NOT_ANCHORED}
          keyExtractor={item => item.user_id}
          showsVerticalScrollIndicator={false}
          estimatedItemSize={56}
          ListHeaderComponent={
            <View>
              {!!lounge.description && <Text style={[s.description, isRTLText(lounge.description) && rtlText]}>{struck(lounge.description)}</Text>}
              {isCreator && (
                <View style={s.coverBlock}>
                  <Text style={s.label}>SALON COVER</Text>
                  {lounge.cover_image ? (
                    <View style={s.coverRow}>
                      <RemoteImage uri={tmdb.backdrop(lounge.cover_image, 'w500')} style={s.coverThumb} contentFit="cover" transition={150} fallback={<PosterMark style={s.coverThumb} size={14} />} />
                      <View style={s.coverActions}>
                        <PressableScale style={s.coverBtn} onPress={handleChangeCover} haptic="selection" accessibilityRole="button" accessibilityLabel="Change salon cover"><Text style={s.coverBtnText}>CHANGE</Text></PressableScale>
                        <PressableScale touch="destructive" style={[s.coverBtn, s.coverBtnRemove]} onPress={handleRemoveCover} haptic="selection" accessibilityRole="button" accessibilityLabel="Remove salon cover"><Text style={[s.coverBtnText, s.coverBtnTextRemove]}>REMOVE</Text></PressableScale>
                      </View>
                    </View>
                  ) : (
                    <PressableScale style={s.coverEmpty} onPress={handleChangeCover} haptic="selection" accessibilityRole="button" accessibilityLabel="Choose a film for the cover">
                      <ImageIcon size={15} color={colors.sepia} strokeWidth={1.5} />
                      <Text style={s.coverEmptyText}>CHOOSE A FILM FOR THE COVER</Text>
                    </PressableScale>
                  )}
                </View>
              )}
              <Text style={s.label}>MEMBERS ({readsRoster ? roster.length : (lounge.member_count ?? 0)})</Text>
              {readsRoster ? null : rosterAwaited ? (
                rosterFailed ? (
                  <View style={s.rosterFailed}>
                    <Text style={s.subtitle}>The roster could not be read.</Text>
                    {onRetryRoster ? <TryAgainLine onPress={onRetryRoster} what="read the roster" style={s.rosterRetry} /> : null}
                  </View>
                ) : <Text style={s.subtitle}>Reading the roster…</Text>
              ) : <Text style={s.subtitle}>The roster is kept for those seated.</Text>}
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
              ) : !holdsARow ? null : (
                <PressableScale style={s.leaveBtn} onPress={handleLeave} accessibilityRole="button">
                  <LogOut size={14} color={colors.sepia} strokeWidth={1.5} />
                  <Text style={s.leaveText}>STEP OUT OF SALON</Text>
                </PressableScale>
              )}
            </View>
          }
        />
      </View>
      </Arrive>
      </PresenceView>
      <ToastHost />
      </InColumn>
    </Modal>
    ) : null}
    </Presence>
  );
}

/** How far the sheet rises as it arrives. */
const SETTINGS_RISE = 320;

/** The exit's backstop: the sheet's slide (MS.quick) is long over by now. */
const COVER_BACKSTOP_MS = 600;

/** Runs `run` as it leaves the screen: drawn inside the sheet, it goes when the sheet has gone. */
function WhenGone({ run }: { run: () => void }) {
  const ran = useEffectEvent(run);
  useEffect(() => () => ran(), []);
  return null;
}

const s = StyleSheet.create({
  backdrop: { flex: 1 },
  frame: { ...StyleSheet.absoluteFill },
  // Fills the sheet's fixed height, so the roster scrolls inside it.
  body: { flex: 1 },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '85%', backgroundColor: colors.ink,
    borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 24, paddingBottom: 28,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(184,137,26,0.15)',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment },
  subtitle: { fontFamily: fonts.serif, fontSize: 13, color: colors.fog, marginTop: 4, lineHeight: 18 },
  // The room's own words, whole, above the roster: the subtitle's face, with the room a label has below it.
  description: { fontFamily: fonts.serif, fontSize: 13, color: colors.fog, lineHeight: 18, marginBottom: 20 },
  // Solid sepia: a word never borrows its contrast from the ground behind it.
  label: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, marginBottom: 12, includeFontPadding: false },
  // The failed read's line and its TRY AGAIN, the act under the words.
  rosterFailed: { alignItems: 'flex-start' },
  rosterRetry: { marginTop: 4 },

  memberBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.soot },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.soot, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  memberAvatarImg: { width: '100%', height: '100%' },
  memberName: { flex: 1, fontFamily: fonts.sub, fontSize: 11, letterSpacing: 1, color: colors.bone, includeFontPadding: false },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusTagText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 0.8, color: colors.fog, includeFontPadding: false },
  founderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2,
    backgroundColor: 'rgba(184,137,26,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.2)',
  },
  // The member's acts: 48pt from the row's top edge, its mark centred on the row as it was drawn
  // (the 8 at its top). Kept off the row's foot, where the open acts' own 48 begins.
  memberMore: { width: 48, height: 48, marginTop: -12, marginBottom: -4, marginLeft: -10, paddingTop: 8, alignItems: 'flex-end', justifyContent: 'center' },
  founderText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.sepia, includeFontPadding: false },

  // 16 above the acts (the row's 12 and these 4) and 16 below: room for each act's 48 between the
  // member's acts above and the next row's below, where a large text size slides BAN under them.
  actionRow: { flexDirection: 'row', gap: 8, paddingTop: 4, paddingBottom: 16, paddingLeft: 42 },
  memberAction: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
    borderRadius: 7, paddingVertical: 7, paddingHorizontal: 11,
  },
  memberActionBan: { borderColor: colors.crimsonBorder },
  memberActionText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.7, color: colors.fog, includeFontPadding: false },

  footer: { marginTop: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash, paddingTop: 20 },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, gap: 10 },
  leaveText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.8, color: colors.sepia, includeFontPadding: false },

  coverBlock: { marginBottom: 22 },
  coverRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  coverThumb: { width: 96, height: 54, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.25)' },
  coverActions: { flex: 1, flexDirection: 'row', gap: 8 },
  coverBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(184,137,26,0.25)' },
  coverBtnRemove: { borderColor: colors.crimsonBorder },
  coverBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.1, color: colors.parchment, includeFontPadding: false },
  coverBtnTextRemove: { color: colors.crimsonInk },
  coverEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 3, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(184,137,26,0.25)', backgroundColor: 'rgba(184,137,26,0.06)' },
  coverEmptyText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia, includeFontPadding: false },
});
