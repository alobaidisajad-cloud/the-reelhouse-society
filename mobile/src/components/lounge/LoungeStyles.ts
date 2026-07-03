/**
 * LoungeStyles — the ActionSheet's paper, and nothing else.
 *
 * History note: this file once carried a full message-bubble chat skin.
 * The Editorial Salon (bubble-less transcript in app/lounge/[id].tsx)
 * replaced it; the dead styles and the orphaned MessageBubble component
 * were buried in the corridor overhaul. Only the long-press sheet lives here.
 */
import { StyleSheet } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';

export const s = StyleSheet.create({
  // ── Action Sheet (long-press on a dispatch) ──
  actionBackdrop: { flex: 1 },
  actionSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(184,137,26,0.15)',
  },
  actionHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.soot,
  },
  actionBtnLast: { borderBottomWidth: 0 },
  actionBtnText: {
    fontFamily: fonts.sub,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.parchment,
    includeFontPadding: false,
  },
  actionBtnDanger: { color: colors.crimson },
});
