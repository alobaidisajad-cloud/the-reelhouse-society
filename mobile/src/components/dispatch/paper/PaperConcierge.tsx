/**
 * ── THE CONCIERGE GAINS A THIRD ACT ──────────────────────────────────────────
 * The brass ＋ already opens a sheet with two rows — Log a Film, Curate a Stack.
 * The Dispatch needs a third, and the obvious way to add it is the wrong one.
 *
 * A third row opening the picker gives you ＋ → sheet → sheet → desk: two native
 * Modals stacked before a modal route even opens, which iOS does not forgive
 * and which this app already learned the hard way when the old FAB was retired.
 *
 * So the sheet SWAPS ITS OWN CONTENT instead. One presentation, two panes, a
 * back arrow between them. Then picker → desk is one Modal to one route, which
 * the parked-route law already handles.
 *
 * ── WHY IT FITS RATHER THAN INTRUDES ─────────────────────────────────────────
 * Nothing here is invented. The Concierge's rows are already icon, title, one
 * line of description — `Log a Film / Set down what you've seen.` The picker's
 * rows are the same anatomy — `TAKE / Say the thing nobody else will.` They
 * were speaking the same language before either knew about the other, so the
 * second pane reads as the same sheet going deeper rather than as another app.
 *
 * Every measurement below is read off `ConciergeButton.tsx` rather than matched
 * by eye: the card, the rule, the 40pt icon disc, the 15pt display title, the
 * 11pt body description, the hairline divider.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Film, ListPlus, Newspaper, ChevronLeft, Lock } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { displayTextProps, decorativeTextProps } from '@/src/constants/textScaling';
import { KIND_RULE } from './paperMetrics';
import { FORMS } from './PaperMore';

/**
 * The row every act wears, in both panes.
 *
 * `hitSlop={null}`, deliberately, and the reason is written in the Concierge
 * itself: PressableScale defaults to 15pt on every side, so two rows stacked a
 * hairline apart have targets that OVERLAP by 30pt — and the later row in the
 * JSX wins, which made the bottom of "Log a Film" open "Curate a Stack". These
 * rows are tall enough to need no help.
 */
const Act = memo(function Act({
  icon, tint, ring, title, desc, locked, onPress,
}: {
  icon: React.ReactNode; tint?: string; ring?: string;
  title: string; desc: string; locked?: boolean; onPress?: () => void;
}) {
  return (
    <PressableScale
      style={[c.row, locked && { opacity: 0.85 }]}
      onPress={onPress}
      hitSlop={null}
      haptic="medium"
      accessibilityRole="button"
      accessibilityLabel={locked ? `${title}. Auteurs only. ${desc}` : `${title}. ${desc}`}
    >
      <View style={[c.disc, { backgroundColor: tint ?? colors.sepiaFaint,
                              borderColor: ring ?? 'rgba(184,137,26,0.35)' }]}>
        {icon}
      </View>
      <View style={c.col}>
        <Text style={c.title} {...displayTextProps}>{title}</Text>
        <Text style={c.desc} {...displayTextProps}>{desc}</Text>
      </View>
      {locked ? (
        <View style={c.lock}>
          <Lock size={9} strokeWidth={2} color={colors.sepia} />
          <Text style={c.lockText} {...decorativeTextProps}>AUTEURS</Text>
        </View>
      ) : null}
    </PressableScale>
  );
});

/** ── PANE ONE ─────────────────────────────────────────────────────────────
 *  The Dispatch sits THIRD, under the two acts that were here first. It is the
 *  newest thing in the house and the other two are what the house is for; a new
 *  feature that puts itself at the top of somebody else's menu is announcing
 *  its own importance rather than earning it.
 */
export const ConciergeActs = memo(function ConciergeActs() {
  return (
    <View style={c.card}>
      <Text style={c.head} {...displayTextProps}>✦ THE CONCIERGE ✦</Text>
      <Text style={c.lore} {...displayTextProps}>At your service.</Text>
      <View style={c.rule} />

      <Act icon={<Film size={18} color={colors.sepia} strokeWidth={1.5} />}
        title="Log a Film" desc="Set down what you've seen." />
      <View style={c.div} />
      <Act icon={<ListPlus size={18} color={colors.bone} strokeWidth={1.5} />}
        tint="rgba(232,223,200,0.06)" ring="rgba(215,205,190,0.2)"
        title="Curate a Stack" desc="Gather films under one theme." />
      <View style={c.div} />
      {/* A newspaper, because that is what the page is. The disc is tinted in
          the Dispatch's own parchment rather than in any one kind's ink — five
          kinds live behind this row and picking one of their colours here would
          promise the wrong one. */}
      <Act icon={<Newspaper size={18} color={colors.parchment} strokeWidth={1.5} />}
        tint="rgba(232,223,208,0.06)" ring="rgba(232,223,208,0.22)"
        title="File to the Dispatch" desc="Say it to the whole house." />
    </View>
  );
});

/** ── PANE TWO ─────────────────────────────────────────────────────────────
 *  The same sheet, gone one level in. The back arrow returns to the acts; it
 *  does not close the sheet, because closing would throw away the tap that got
 *  here and make the member start again.
 */
export const ConciergeForms = memo(function ConciergeForms({ onBack }: { onBack?: () => void }) {
  return (
    <View style={c.card}>
      <View style={c.headRow}>
        <PressableScale onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 6, right: 12 }}
          haptic="selection" accessibilityRole="button" accessibilityLabel="Back to the concierge">
          <ChevronLeft size={16} strokeWidth={2} color={colors.sepia} />
        </PressableScale>
        <Text style={[c.head, { flex: 1 }]} {...displayTextProps}>WHAT ARE YOU FILING?</Text>
        {/* the arrow's width, so the title stays optically centred rather than
            pushed one glyph to the right */}
        <View style={{ width: 16 }} />
      </View>
      <View style={c.rule} />

      {FORMS.map((f, i) => (
        <View key={f.kind}>
          {i > 0 && <View style={c.div} />}
          <Act
            icon={<Text style={[c.kindMark, { color: KIND_RULE[f.kind] }]} {...decorativeTextProps}>
              {f.name.slice(0, 1)}
            </Text>}
            tint="rgba(232,223,208,0.04)"
            ring={`${KIND_RULE[f.kind]}55`}
            title={f.name.charAt(0) + f.name.slice(1).toLowerCase()}
            desc={f.line}
            locked={f.locked}
          />
        </View>
      ))}
    </View>
  );
});

const c = StyleSheet.create({
  /* read off ConciergeButton.tsx, not matched by eye */
  card: {
    backgroundColor: colors.soot,
    borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 6,
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6,
  },
  head: {
    fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3,
    color: colors.sepia, textAlign: 'center',
  },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  lore: {
    fontFamily: fonts.bodyItalic, fontSize: 10, color: colors.fog, opacity: 0.8,
    marginTop: 5, textAlign: 'center',
  },
  rule: { height: 1, backgroundColor: 'rgba(184,137,26,0.18)', marginTop: 12 },
  div: { height: 1, backgroundColor: 'rgba(184,137,26,0.18)' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  disc: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  /**
   * The kind's initial, set in its own ink — the code being taught one more
   * time, in the place a member meets it before they have filed anything.
   *
   * 16.5, not 17. Measuring the page and the cards TOGETHER caught 17 sitting
   * half a point from the 16.5 that a take, a seeking and the card's title
   * floor all use — invisible to a reader, a second number in the scale for
   * ever. This one is mine to move, unlike the row title below.
   */
  kindMark: { fontFamily: fonts.display, fontSize: 16.5, includeFontPadding: false },
  col: { flex: 1, minWidth: 0 },
  /**
   * ── 15 STAYS, AND IT IS NOT A MISTAKE ──────────────────────────────────────
   * The union audit flags this against the Dispatch's 15.5 as "too close to
   * tell apart", and it is right that they are — but the fix is not to move it.
   *
   * This sheet is the APP's component, not the Dispatch's. Every measurement in
   * it is read off `ConciergeButton.tsx`, where `actionTitle` is 15, and the
   * whole point of doing that is that the two cannot drift. Rounding it to the
   * Dispatch's scale would make this mockup describe a sheet the app does not
   * have.
   *
   * Two design systems meet at this seam. The rule is that the older one wins
   * on its own surface — so a later pass "tidying" this to 15.5 would be
   * breaking the match, not closing a gap.
   */
  title: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 3 },
  desc: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: colors.fog },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2,
    color: colors.sepia, includeFontPadding: false,
  },
});
