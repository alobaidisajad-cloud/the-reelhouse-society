/**
 * VerdictSheet — a verdict of the house's on the member, read whole, appealed once (review round 14).
 * ─────────────────────────────────────────────────────────────────────────────
 * A member warned, suspended or banned read the house's reason in a notice cut at three lines, and
 * the notice opened nothing: no screen showed the reason whole, and there was no appeal. The owner
 * decided (2026-11-19): a member may appeal each verdict ONCE from inside the app. They read the
 * house's full reason here, write one appeal, a moderator other than the one who ruled hears it at
 * the Tribunal, and they are told the outcome (a notice that opens this sheet again, the outcome on it).
 *
 * Opened from a notice of the house's that names its verdict (the notices board, or its push). The
 * member's own words are kept as they write (useKeptWords, 'appeal', per verdict), so a sheet closed
 * or a refused filing never costs them a word; a silenced member may appeal too (the house takes it).
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, TextInput } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { InColumn } from '@/src/components/layout/InColumn';
import { useSheetBottom } from '@/src/components/layout/navMetrics';
import { ToastHost } from '@/src/components/ToastHost';
import { TryAgainLine } from '@/src/components/TryAgain';
import { ModerationService, type MyVerdict } from '@/src/services/ModerationService';
import { useAuthStore } from '@/src/stores/auth';
import { stillSignedIn } from '@/src/stores/domain/helpers/sessionGuard';
import { useKeptWords } from '@/src/hooks/useKeptWords';
import { MY_WITHHELD } from '@/src/hooks/useMyWithheld';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import { APPEAL_MAX, sanitizeAppeal } from '@/src/utils/sanitizeInput';
import { formatClockTime, formatDate } from '@/src/utils/timeAgo';
import { counted } from '@/src/utils/counted';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';

/** The house's refusal by its word (P0002): the verdict gone from the record, or already appealed. */
export function appealRefusal(err: unknown): 'VERDICT_GONE' | 'ALREADY_APPEALED' | null {
  if (!err || typeof err !== 'object') return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code !== 'P0002') return null;
  return message === 'VERDICT_GONE' || message === 'ALREADY_APPEALED' ? message : null;
}

/** What the house did, as the sheet heads it. */
export function verdictHeading(v: Pick<MyVerdict, 'action' | 'duration_hours'>): string {
  switch (v.action) {
    case 'warn': return 'A FORMAL WARNING';
    case 'suspend': return v.duration_hours ? `MEMBERSHIP PAUSED · ${v.duration_hours} ${v.duration_hours === 1 ? 'HOUR' : 'HOURS'}` : 'MEMBERSHIP PAUSED';
    case 'mute_user': return 'MUTED FOR A TIME';
    case 'ban': return 'MEMBERSHIP CLOSED';
    case 'permanent_exile': return 'PERMANENTLY CLOSED';
    case 'delete_content': return 'A PIECE REMOVED';
    default: return 'A VERDICT OF THE HOUSE';
  }
}

/**
 * What a removed piece withheld (round 14) is told: no one but its author sees it; it is kept whole until
 * its appeal is heard (once filed), or until the window ends unappealed; overturned, it returns whole.
 */
export function withheldSays(v: Pick<MyVerdict, 'appeal_by' | 'appeal'>): string {
  const back = 'Overturned, it returns whole, its critiques and marks with it.';
  if (v.appeal) return `No one but you can see it. It is kept whole until your appeal is heard. ${back}`;
  if (v.appeal_by) {
    return `No one but you can see it. Appeal by ${appealByWords(v.appeal_by)} and it is kept whole until your appeal is heard; unappealed, it is deleted then. ${back}`;
  }
  return `No one but you can see it. ${back}`;
}

/** How the appeal stands, as its heading says it. */
const APPEAL_HEADING = {
  pending: 'YOUR APPEAL · AWAITING THE TRIBUNAL',
  upheld: 'YOUR APPEAL · THE VERDICT IS UPHELD',
  overturned: 'YOUR APPEAL · THE VERDICT IS OVERTURNED',
} as const;

/** Drawn only while a verdict is asked for: nothing of it is read before. */
export function VerdictSheet({ verdictId, onClose }: { verdictId: string | null; onClose: () => void }) {
  if (!verdictId) return null;
  return <OpenVerdict key={verdictId} verdictId={verdictId} onClose={onClose} />;
}

function OpenVerdict({ verdictId, onClose }: { verdictId: string; onClose: () => void }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const sheetFoot = useSheetBottom();
  const queryClient = useQueryClient();
  // Keyed on who asks as well as what: another member signed in on this phone never reads this one's.
  const key = ['my-verdict', userId, verdictId] as const;
  const { data: verdict, isLoading, isError, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => ModerationService.getMyVerdict(verdictId),
    enabled: !!userId,
    retry: (n, err) => appealRefusal(err) === null && n < 2,
  });
  const gone = isError && appealRefusal(error) === 'VERDICT_GONE';

  const [words, setWords, letGo] = useKeptWords(userId, 'appeal', verdictId);
  const appeal = useMutation({
    mutationFn: (text: string) => ModerationService.fileAppeal(verdictId, text),
    onSuccess: () => {
      // Filed for the member who asked; one who signed out meanwhile is not spoken to.
      if (!stillSignedIn(userId)) return;
      letGo();
      TactileEngine.success();
      reelToast('Your appeal is filed. The Tribunal will hear it.');
      // A piece withheld is now kept until the hearing: every mark of it says so (round 14).
      void queryClient.invalidateQueries({ queryKey: [MY_WITHHELD] });
      // The record in Settings says the appeal awaits the Tribunal.
      void queryClient.invalidateQueries({ queryKey: ['my-verdicts'] });
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => {
      if (!stillSignedIn(userId)) return;
      const refused = appealRefusal(err);
      // Already appealed (a second phone, a second press): the sheet reads the appeal as it stands.
      if (refused === 'ALREADY_APPEALED') {
        letGo();
        reelToast('This verdict has already been appealed.');
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      if (refused === 'VERDICT_GONE') {
        reelToast.error('This verdict is no longer on your record.');
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      // Not reached, or refused for another reason: the words stay in the box, kept.
      reelToast.error('Your appeal could not be filed. Your words are kept: try again.');
    },
  });

  const cleaned = sanitizeAppeal(words).trim();
  const fileIt = useCallback(() => {
    if (!cleaned || appeal.isPending) return;
    TactileEngine.mutate();
    appeal.mutate(cleaned);
  }, [cleaned, appeal]);

  const close = useCallback(() => {
    // An appeal on its way is not given up by closing: it lands, and the next opening reads it.
    onClose();
  }, [onClose]);

  return (
    <Modal statusBarTranslucent visible transparent animationType="fade" onRequestClose={close}>
      <InColumn scrim={{ color: 'rgba(0,0,0,0.7)' }}>
        <KeyboardAvoidingView onAccessibilityEscape={close} style={st.overlay} behavior="padding">
          <View style={[st.sheet, { paddingBottom: sheetFoot }]}>
            <View style={st.handle} />
            <View style={st.header}>
              <Text style={st.eyebrow} accessibilityRole="header">A NOTICE FROM THE HOUSE</Text>
              <PressableScale touch="wayOut" onPress={close} haptic="selection" pressedScale={0.9}
                accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={colors.fog} />
              </PressableScale>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}>
              {isLoading ? (
                <Text style={st.quiet}>Retrieving the verdict…</Text>
              ) : gone ? (
                <Text style={st.quiet}>This verdict is no longer on your record.</Text>
              ) : isError || !verdict ? (
                // Unread is not nothing: a failed read says so, and asks again.
                <View>
                  <Text style={st.quiet}>The verdict could not be read.</Text>
                  <TryAgainLine onPress={() => refetch()} what="read the verdict" style={st.retry} />
                </View>
              ) : (
                <VerdictBody
                  verdict={verdict}
                  words={words}
                  setWords={setWords}
                  filing={appeal.isPending}
                  canFile={!!cleaned && !appeal.isPending}
                  onFile={fileIt}
                />
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
        <ToastHost />
      </InColumn>
    </Modal>
  );
}

function VerdictBody({ verdict: v, words, setWords, filing, canFile, onFile }: {
  verdict: MyVerdict; words: string; setWords: (w: string) => void; filing: boolean; canFile: boolean; onFile: () => void;
}) {
  const overturned = v.appeal?.status === 'overturned';
  return (
    <>
      <Text style={st.title} accessibilityRole="header">{verdictHeading(v)}</Text>
      <Text style={st.meta}>
        GIVEN {formatDate(v.created_at, 'long').toUpperCase()}
        {v.expires_at ? ` · UNTIL ${formatDate(v.expires_at, 'long').toUpperCase()}, ${formatClockTime(v.expires_at)}` : ''}
      </Text>
      {!!v.lifted_at && !overturned && (
        <View style={st.block}>
          <Text style={st.label}>LIFTED {formatDate(v.lifted_at, 'long').toUpperCase()}</Text>
          {!!v.lift_reason && <Text style={st.words} selectable>{v.lift_reason}</Text>}
        </View>
      )}

      <View style={st.block}>
        <Text style={st.label}>THE HOUSE’S REASON</Text>
        <Text style={st.words} selectable>{v.reason}</Text>
      </View>

      {!!v.removed && (!!v.removed.title || !!v.removed.body) && (
        <View style={st.block}>
          <Text style={st.label}>YOUR WORDS, AS THEY WERE</Text>
          {!!v.removed.title && <Text style={st.removedTitle} selectable>{v.removed.title}</Text>}
          {!!v.removed.body && <Text style={st.words} selectable>{v.removed.body}</Text>}
        </View>
      )}

      {/* Withheld, not deleted (round 14): the window to appeal it, or that it waits for the hearing. */}
      {v.withheld && (
        <View style={st.block}>
          <Text style={st.label} accessibilityRole="header">WITHHELD, NOT DELETED</Text>
          <Text style={st.words}>{withheldSays(v)}</Text>
        </View>
      )}

      {v.appeal ? (
        <View style={st.block}>
          <Text style={st.label} accessibilityRole="header">{APPEAL_HEADING[v.appeal.status]}</Text>
          <Text style={st.words} selectable>{v.appeal.text}</Text>
          <Text style={st.meta}>FILED {formatDate(v.appeal.filed_at, 'long').toUpperCase()}</Text>
          {v.appeal.status === 'pending' && v.no_moderator_yet && (
            <Text style={[st.words, st.spaced]}>{appealWaitsSays(v)}</Text>
          )}
          {v.appeal.status !== 'pending' && !!v.appeal.note && (
            <>
              <Text style={[st.label, st.spaced]}>THE TRIBUNAL’S WORD</Text>
              <Text style={st.words} selectable>{v.appeal.note}</Text>
            </>
          )}
          {overturned && (
            <Text style={[st.words, st.spaced]}>
              {v.action === 'delete_content' ? overturnedSays(v) : 'The verdict is struck from your record.'}
            </Text>
          )}
        </View>
      ) : v.can_appeal ? (
        <View style={st.block}>
          <Text style={st.label} accessibilityRole="header">YOUR APPEAL</Text>
          <Text style={st.quietSmall}>
            You may appeal this verdict once. A moderator other than the one who ruled will hear it, and you will be told the outcome.
          </Text>
          <TextInput
            style={st.input}
            value={words}
            onChangeText={setWords}
            placeholder="Say why the house should think again…"
            placeholderTextColor={colors.fog}
            selectionColor={colors.selection}
            multiline
            textAlignVertical="top"
            maxLength={APPEAL_MAX}
            editable={!filing}
            accessibilityLabel="Your appeal"
          />
          <Text style={st.count} accessibilityLabel={`${words.length} of ${counted(APPEAL_MAX, 'character', 'characters')}`}>{words.length} / {APPEAL_MAX}</Text>
          <PressableScale touch="commit"
            style={[st.file, !canFile && UNREADY.plate]}
            onPress={onFile}
            disabled={!canFile}
            haptic="medium"
            pressedScale={0.97}
            accessibilityRole="button"
            accessibilityLabel={filing ? 'Filing the appeal' : 'File the appeal'}
            accessibilityState={{ disabled: !canFile, busy: filing }}
          >
            {filing
              ? <ActivityIndicator size="small" color={colors.parchment} />
              : <Text style={[st.fileText, !canFile && UNREADY.words]}>FILE THE APPEAL</Text>}
          </PressableScale>
        </View>
      ) : null}
    </>
  );
}

const st = StyleSheet.create({
  // Its ground is the scrim InColumn draws across the window.
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.15)',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 },
  eyebrow: { flex: 1, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.crimsonInk },
  body: { paddingBottom: spacing.md },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.parchment, marginBottom: 6 },
  meta: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog, marginTop: 4 },
  block: { marginTop: spacing.lg },
  label: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fogQuiet, marginBottom: 6 },
  spaced: { marginTop: spacing.md },
  words: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, lineHeight: 21 },
  removedTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, marginBottom: 4 },
  quiet: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.fog, marginTop: spacing.md },
  quietSmall: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, lineHeight: 18, marginBottom: spacing.md },
  retry: { marginTop: 8, alignSelf: 'flex-start' },
  input: {
    backgroundColor: colors.well,
    borderWidth: 1,
    borderColor: colors.ash,
    borderBottomColor: colors.fieldEdge,
    borderRadius: radii.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchment,
    padding: 14,
    minHeight: 120,
  },
  count: { fontFamily: fonts.sub, fontSize: 10, color: colors.fogQuiet, alignSelf: 'flex-end', marginTop: 4 },
  // The one act here: 48 tall by its own box.
  file: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.sm,
    backgroundColor: colors.crimson,
    marginTop: spacing.md,
  },
  fileText: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 3, color: colors.parchment, textAlign: 'center' },
});

/**
 * Until when a withheld piece is kept unappealed, in the member's own day and hour (the house's date
 * helpers read the phone's clock): "18 December 2026, 10:00 AM". The day alone would be untrue west of
 * the house's own clock, where that day ends hours before the piece is deleted.
 */
export function appealByWords(at: string): string {
  const hour = formatClockTime(at);
  return hour ? `${formatDate(at, 'long')}, ${hour}` : formatDate(at, 'long');
}

/**
 * An appeal no moderator may hear yet, said plainly (the owner's decision, 2026-11-19): it waits for a
 * moderator other than the one who ruled, and never one it is about; what it removed stays withheld,
 * whole, however long it waits.
 */
export function appealWaitsSays(v: Pick<MyVerdict, 'action'>): string {
  const waits = 'Your appeal waits for a moderator other than the one who ruled, and never one it is about. None may hear it yet; it is heard as soon as one may.';
  return v.action === 'delete_content' ? `${waits} Meanwhile what it removed stays withheld, whole, however long it waits.` : waits;
}

/**
 * What became of a removal overturned, as the hearing wrote it on the verdict: put back where it stood
 * (whole, for a piece withheld), else the words kept above to file again, else nothing left to put back.
 */
export function overturnedSays(v: Pick<MyVerdict, 'put_back' | 'removed'>): string {
  if (v.put_back) return 'What it removed stands again where it was.';
  if (v.removed && (v.removed.title || v.removed.body)) return 'Your words are kept above, to file again.';
  return 'What it removed is no longer in the house.';
}
