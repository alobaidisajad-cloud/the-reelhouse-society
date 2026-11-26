import TactileEngine from '@/src/utils/TactileEngine';
import { InColumn } from '@/src/components/layout/InColumn';
import { RemoteImage } from '@/src/components/Picture';
import {
    AlertTriangle,
    ArrowLeft,
    Ban,
    Check,
    CheckSquare,
    Clock,
    FileSearch,
    Gavel,
    Layers,
    List,
    Lock,
    Scale,
    Skull,
    Square,
    Trash2,
    X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { Presence, PresenceView } from '@/src/components/motion/Presence';

import PressableScale from '@/src/components/PressableScale';
import { ModerationService, PriorityCursor, REPORTS_PAGE_SIZE, ReportEvidence } from '@/src/services/ModerationService';
import { moreMayFollow, readAsFar } from '@/src/utils/readAsFar';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import { REPORT_REASON_LABELS, type ModAction, type ModActionRecord, type ReportReason } from '@/src/types/moderation';
import reelToast from '@/src/utils/reelToast';
import { REFRESH_FAILED } from '@/src/components/EmptyStates';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClock } from '@/src/hooks/useClock';
import { instantOf } from '@/src/utils/instant';
import { LinearGradient } from 'expo-linear-gradient';
import { useContentBottom, usePushedHeaderTop, useSheetBottom } from '@/src/components/layout/navMetrics';
import { ToastHost } from '@/src/components/ToastHost';
import { EDGE_LIT, WASH } from '@/src/theme/light';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { formatDate } from '@/src/utils/timeAgo';
import { counted } from '@/src/utils/counted';
import { TryAgainLine } from '@/src/components/TryAgain';
import { SecondKeyDoor } from '@/src/components/admin/SecondKeyDoor';
import { nav } from '@/src/utils/typedRouter';
import { initialOf } from '@/src/utils/text';
import { MAX_LENGTHS, sanitizeInput } from '@/src/utils/sanitizeInput';
import { Arrive } from '@/src/components/Arrive';
import { HOURS_DIGITS } from '@/src/constants/inputLimits';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { AppealsDocket } from '@/src/components/admin/AppealsDocket';
import { SanctionsList } from '@/src/components/admin/SanctionsList';
import { putBackWords, useKeptWords } from '@/src/hooks/useKeptWords';
import type { PieceWords } from '@/src/services/ModerationService';

interface TribunalTarget {
  id: string;
  username: string;
  warning_count?: number;
  avatar_url?: string | null;
}

interface TribunalReport {
  id: string;
  content_type: string;
  content_id: string;
  reason: string;
  details?: string;
  status: string;
  created_at: string;
  reporter?: { id: string; username: string } | { id: string; username: string }[];
  target_user_id?: string;
  target_user?: TribunalTarget | TribunalTarget[];
  report_count?: number;
}

/** The charge, in the house's voice — falls back to the raw reason slug. */
function chargeLabel(reason: string): string {
  return REPORT_REASON_LABELS[reason as ReportReason]?.label ?? reason.toUpperCase();
}

/**
 * A verdict the house refused because the case moved on (P0002, told apart by its word): judged
 * by another moderator meanwhile, or a REMOVE CONTENT on a piece already deleted; or because the
 * case is about this moderator (42501, OWN_CASE: another moderator judges it). Null for any other
 * failure.
 */
function verdictRefusal(err: unknown): 'ALREADY_JUDGED' | 'PIECE_GONE' | 'OWN_CASE' | null {
  if (!err || typeof err !== 'object') return null;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === '42501' && message === 'OWN_CASE') return 'OWN_CASE';
  if (code !== 'P0002') return null;
  return message === 'ALREADY_JUDGED' || message === 'PIECE_GONE' ? message : null;
}

/** What a moderator is told of a case about themselves, which another moderator judges. */
const OWN_CASE_SAID ='This case is about you: another moderator must judge it.';

/**
 * What a bulk dismissal says: the cases the house closed, never the number selected. A case
 * another moderator judged meanwhile is not closed again (the house closes only pending cases),
 * and is told apart. With no count in the answer, no number is said.
 */
function bulkDismissedWords(asked: number, closed: number | null, own = 0): string {
  // A case about the moderator is never dismissed by them: it stays, for another moderator.
  const left = own > 0 ? ` ${own} about you, left for another moderator.` : '';
  if (asked === 0) return left.trim();
  if (closed === null) return `Cases dismissed.${left}`;
  if (closed === 0) return `Already judged by another moderator.${left}`;
  const judged = asked - closed;
  if (judged <= 0) return `${closed} report(s) dismissed.${left}`;
  return `${closed} report(s) dismissed. ${judged} already judged by another moderator.${left}`;
}

/** The priority queue's page: the most cases a read of it asks for. */
const PRIORITY_PAGE = 20;

/** Where the priority queue reads on from: past its last case, in the house's own order. */
const priorityCursorOf = (last: TribunalReport): PriorityCursor => ({
  report_count: Number(last.report_count ?? 1),
  created_at: last.created_at,
  id: last.id,
});

const readPriority = async (after: PriorityCursor | undefined, size: number) =>
  (await ModerationService.getPriorityQueue(size, after)) as unknown as TribunalReport[];

/**
 * The pending docket read as far as `want` cases, with the house's exact count from its first page.
 * Its pages meet on their boundary case (asked from it, not past it): each case is held once.
 */
async function readPendingAsFar(want: number) {
  const first = { total: null as number | null };
  const rows = await readAsFar<TribunalReport, string>(async (after) => {
    const page = await ModerationService.getPendingReports(after);
    if (after === undefined) first.total = page.total;
    return page.rows as unknown as TribunalReport[];
  }, (last) => last.created_at, want, REPORTS_PAGE_SIZE, (r) => r.id);
  return { rows, total: first.total };
}

type EnforcementAction = 'warn' | 'suspend' | 'ban' | 'permanent_exile' | 'delete_content';
// THE DOCKET, URGENT, and (round 14) the APPEALS the members filed and the SANCTIONS standing.
type TribunalView = 'pending' | 'priority' | 'appeals' | 'sanctions';

/**
 * How a verdict on the record stands now (round 14): struck on appeal, lifted early by an admin, served
 * to its end, waiting to be heard, or upheld. Only a verdict overturned is struck: a lift is mercy, not
 * a finding that the member did nothing, and a sentence served is a sentence given. A sentence that ran
 * out before a lift is served, not lifted. Null when it stands as given.
 */
export function recordStanding(record: Pick<ModActionRecord, 'lifted_at' | 'appeal_status'> & Partial<Pick<ModActionRecord, 'expires_at'>>,
  now: number): string | null {
  if (record.appeal_status === 'overturned') return 'OVERTURNED ON APPEAL';
  const ends = record.expires_at ? instantOf(record.expires_at) : NaN;
  if (record.lifted_at) {
    const lifted = instantOf(record.lifted_at);
    return Number.isFinite(ends) && Number.isFinite(lifted) && ends <= lifted ? 'SERVED' : 'LIFTED';
  }
  if (record.appeal_status === 'pending') return 'UNDER APPEAL';
  if (Number.isFinite(ends) && ends <= now) return 'SERVED';
  if (record.appeal_status === 'upheld') return 'UPHELD ON APPEAL';
  return null;
}

interface ActionModalState {
  visible: boolean;
  action: EnforcementAction | null;
  report: TribunalReport | null;
}

// ── Enforcement History Panel ──────────────────────────────────────────────

/**
 * One member's enforcement record, from the one read made for the whole docket
 * (ranked per member, so a prolific offender cannot crowd the others out).
 */
export function EnforcementHistory({ history, isLoading, failed, onRetry }: {
  history: ModActionRecord[]; isLoading: boolean; failed?: boolean; onRetry?: () => void;
}) {
  // How each verdict stands now, read on the shared clock: a sentence that runs out reads SERVED then.
  const standings = useClock((now) => history.slice(0, 5).map((r) => recordStanding(r, now) ?? '').join('|')).split('|');
  if (isLoading) {
    return (
      <View style={s.historyContainer}>
        <Text style={s.historyLabel}>ENFORCEMENT RECORD</Text>
        <Text style={s.historyEmpty}>Retrieving the record…</Text>
      </View>
    );
  }

  // Unread is not clean: no strip would read as a first offence.
  if (failed) {
    return (
      <View style={s.historyContainer}>
        <Text style={s.historyLabel}>ENFORCEMENT RECORD</Text>
        <Text style={s.historyEmpty}>The record could not be read.</Text>
        {onRetry && (
          <TryAgainLine onPress={onRetry} what="read the enforcement record" style={s.historyRetry} />
        )}
      </View>
    );
  }

  if (history.length === 0) return null;

  return (
    <View style={s.historyContainer}>
      <Text style={s.historyLabel}>ENFORCEMENT RECORD</Text>
      {history.slice(0, 5).map((record: ModActionRecord, i) => {
        const standing = standings[i] || null;
        const struck = standing === 'OVERTURNED ON APPEAL';
        return (
        <View key={record.id} style={s.historyRow}>
          <View style={[s.historyDot, struck && s.historyDotStruck]} testID={struck ? 'record-struck' : 'record-holds'} />
          <View style={s.historyContent}>
            <Text style={s.historyAction}>
              {record.action.toUpperCase()}{standing ? ` · ${standing}` : ''}
            </Text>
            {/* Whole: no other place in the case reads a past verdict's reason. */}
            <Text style={s.historyReason} selectable>
              {record.reason}
            </Text>
            <Text style={s.historyDate}>
              {formatDate(record.created_at)}
            </Text>
          </View>
        </View>
        );
      })}
    </View>
  );
}

/**
 * One exhibit: a piece's words as the house read them, now or as reported (round 14). A page's
 * display name and picture and a salon's cover are shown too: a report about them is about them.
 */
function Exhibit({ words, said }: { words: PieceWords; said?: string }) {
  const picture = words.avatar_url || words.cover_image;
  return (
    <>
      {!!said && <Text style={[s.contextLabel, s.exhibitSaid]}>{said}</Text>}
      {/* Whole, as the words under it: a title as reported is held nowhere else, and may be the offence. */}
      {!!words.title && <Text style={s.evidenceTitle} selectable>{words.title}</Text>}
      {!!words.display_name && <Text style={s.evidenceTitle} selectable>Display name: {words.display_name}</Text>}
      {!!picture && (
        <RemoteImage uri={picture} style={s.exhibitPicture} contentFit="cover"
          // Its file gone from the house (a new picture's upload once deleted the old one): said, never a blank.
          fallback={<Text style={s.exhibitGone}>{words.avatar_url ? 'The page’s picture is no longer held.' : 'The salon’s cover is no longer held.'}</Text>}
          accessible accessibilityLabel={words.avatar_url ? 'The page’s picture' : 'The salon’s cover'} />
      )}
      {!!words.body && <Text style={s.contextValue} selectable>“{words.body}”</Text>}
    </>
  );
}

/**
 * The evidence not found, said as it is: withheld by an earlier verdict (not destroyed: it may come back
 * on its appeal), or gone from the house.
 */
export function evidenceGoneSays(e: Pick<ReportEvidence, 'withheld' | 'appealed'>): string {
  if (e.withheld) {
    return e.appealed
      ? 'Withheld under an earlier verdict, awaiting its appeal.'
      : 'Withheld under an earlier verdict, while its member may appeal it.';
  }
  return 'The evidence has been destroyed — the page no longer exists.';
}

// ── Warning Count Badge ────────────────────────────────────────────────────

function WarningBadge({ count }: { count?: number }) {
  if (!count || count === 0) return null;
  return (
    <View style={s.warningBadge}>
      <AlertTriangle size={10} color={colors.sepia} />
      <Text style={s.warningBadgeText}>{count} {count === 1 ? 'WARNING' : 'WARNINGS'}</Text>
    </View>
  );
}

// ── Report Count Badge ─────────────────────────────────────────────────────

function ReportCountBadge({ count }: { count?: number }) {
  if (!count || count <= 1) return null;
  return (
    <View style={s.reportCountBadge}>
      <Layers size={10} color={colors.crimson} />
      <Text style={s.reportCountBadgeText}>×{count} REPORTS</Text>
    </View>
  );
}

// ── One case on the docket ─────────────────────────────────────────────────

/** A case whose member has no record read: one list for all of them, so it is never a change. */
const NO_RECORD: ModActionRecord[] = [];

/**
 * The same case, read again: a docket read again after a verdict hands back a copy of every case
 * that moved up a place (the read shares only what stands where it stood), the same words in it.
 */
const sameCase = (a: TribunalReport, b: TribunalReport) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * One case on the docket, drawn again only when something it shows changed: a verdict, a page more
 * or a record read redraws the cases it touched, never every case on the docket. Every handler it
 * is handed keeps its identity across the screen's renders.
 */
const DocketCase = React.memo(function DocketCase({
  item, multiSelectMode, isSelected, ev, history, recordLoading, recordFailed, reread,
  toggleReportSelection, summonEvidence, handleDismiss, openActionModal, handleBanOrExile,
}: {
  item: TribunalReport;
  multiSelectMode: boolean;
  isSelected: boolean;
  ev: { loading: boolean; data?: ReportEvidence } | undefined;
  history: ModActionRecord[];
  recordLoading: boolean;
  recordFailed: boolean;
  /** Reads the member's record again; none for a case with no member. */
  reread: (() => Promise<unknown>) | undefined;
  toggleReportSelection: (reportId: string) => void;
  summonEvidence: (reportId: string) => Promise<void>;
  handleDismiss: (report: TribunalReport) => void;
  openActionModal: (action: EnforcementAction, report: TribunalReport) => void;
  handleBanOrExile: (action: 'ban' | 'permanent_exile', report: TribunalReport) => void;
}) {
  const reporterName = Array.isArray(item.reporter)
    ? (item.reporter[0] as any)?.username
    : item.reporter && typeof item.reporter === 'object' && 'username' in item.reporter
      ? (item.reporter as any).username
      : 'unknown';

  const accused = Array.isArray(item.target_user) ? item.target_user[0] : item.target_user;
  const warningCount = accused?.warning_count ?? 0;

  return (
    <PressableScale
      style={[s.reportCard, isSelected && s.reportCardSelected]}
      // A whole case card by its own box: the default 15pt halo laid each card 14pt
      // over the next in the docket, and a tap meant to select one could select its
      // neighbour (the touch sweep, review round 7's docket tests).
      hitSlop={null}
      onPress={multiSelectMode ? () => toggleReportSelection(item.id) : undefined}
      disabled={!multiSelectMode}
      pressedScale={multiSelectMode ? 0.98 : 1}
      // Outside SELECT the card only holds its controls: an accessibility element there
      // (Pressable's default) was ONE dimmed stop to VoiceOver, which never goes inside one,
      // so no verdict could be reached (round 12). In SELECT it is the case's checkbox,
      // named for the case; what is inside it then neither speaks nor takes a tap.
      accessible={multiSelectMode}
      accessibilityRole={multiSelectMode ? 'checkbox' : 'none'}
      accessibilityLabel={multiSelectMode ? `Case filed ${formatDate(item.created_at)}: ${chargeLabel(item.reason).toLowerCase()}${accused?.username ? `, against @${accused.username}` : ''}` : undefined}
      accessibilityState={multiSelectMode ? { checked: isSelected } : {}}
    >
      {/* Checkbox for multi-select mode */}
      {multiSelectMode && (
        <View style={s.checkboxRow}>
          {isSelected ? (
            <CheckSquare size={20} color={colors.sepia} />
          ) : (
            <Square size={20} color={colors.fog} />
          )}
        </View>
      )}

      {/* The case itself. In SELECT a tap anywhere on the card chooses it, and its
          checkbox speaks for it, so nothing in here is a stop or takes the tap. */}
      <View pointerEvents={multiSelectMode ? 'none' : 'auto'} importantForAccessibility={multiSelectMode ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={multiSelectMode}>
      <View style={s.cardHeader}>
        <Text style={s.reportMeta}>
          CASE FILED {formatDate(item.created_at)}
        </Text>
        <View style={s.badgeRow}>
          <ReportCountBadge count={item.report_count} />
          <View style={s.typeBadge}>
            <Text style={s.typeBadgeText}>{item.content_type.replace('_', ' ').toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <Text style={s.reasonTitle}>{chargeLabel(item.reason)}</Text>

      {/* The Accused */}
      {accused?.username ? (
        <PressableScale
          style={s.accusedRow}
          onPress={() => nav.push(`/user/${accused.username}`)}
          haptic="selection"
          pressedScale={0.98}
          accessibilityRole="button"
          accessibilityLabel={`The accused: ${accused.username}${warningCount ? `, ${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}` : ''}. Open their file.`}
        >
          <View style={s.accusedAvatar}>
            <RemoteImage uri={accused.avatar_url} style={s.accusedAvatarImg} contentFit="cover" fallback={<Text style={s.accusedAvatarLetter} {...UNSPOKEN}>{initialOf(accused.username)}</Text>} />
          </View>
          <View style={s.accusedInfo}>
            <Text style={s.accusedLabel}>THE ACCUSED</Text>
            <Text style={s.accusedName} numberOfLines={1}>@{accused.username}</Text>
            {/* under the name, so the name has the row's whole width (beside it, a fifteen-letter one lost its end) */}
            <WarningBadge count={warningCount} />
          </View>
        </PressableScale>
      ) : (
        <View style={s.accusedRow}>
          <View style={s.accusedInfo}>
            <Text style={s.accusedLabel}>THE ACCUSED</Text>
            <Text style={s.accusedUnknown}>No member named — this case can only be dismissed.</Text>
          </View>
        </View>
      )}

      {/* The Evidence */}
      <View style={s.detailsBox}>
        <Text style={s.contextLabel}>THE EVIDENCE</Text>
        {ev?.data ? (
          ev.data.found ? (
            <>
              <Exhibit words={ev.data} said={ev.data.changed ? 'AS IT STANDS NOW' : undefined} />
              {/* Edited since it was reported: the moderator judges the words reported,
                  kept by the house when the report was filed (round 14). */}
              {ev.data.changed && !!ev.data.reported && (
                <View style={s.asReported}>
                  <Exhibit words={ev.data.reported} said="AS REPORTED · EDITED SINCE" />
                </View>
              )}
              {!!ev.data.route && (
                <PressableScale room="vertical"
                  onPress={() => nav.push(ev.data!.route!)}
                  haptic="selection"
                  pressedScale={0.97}
                  accessibilityRole="button"
                  accessibilityLabel="Open the reported page"
                >
                  <Text style={s.evidenceOpen}>OPEN THE PAGE →</Text>
                </PressableScale>
              )}
            </>
          ) : (
            <>
              <Text style={s.evidenceDestroyed}>{evidenceGoneSays(ev.data)}</Text>
              {/* Deleted since it was reported: its words, as reported, still judge the member. */}
              {!!ev.data.reported && (
                <View style={s.asReported}>
                  <Exhibit words={ev.data.reported} said="THE WORDS AS REPORTED" />
                </View>
              )}
            </>
          )
        ) : (
          <PressableScale room
            style={s.summonBtn}
            onPress={() => summonEvidence(item.id)}
            disabled={!!ev?.loading}
            haptic="selection"
            pressedScale={0.97}
            accessibilityRole="button"
            accessibilityLabel="Summon the evidence"
          >
            <FileSearch size={12} color={colors.sepia} />
            <Text style={s.summonText}>{ev?.loading ? 'RETRIEVING…' : 'SUMMON THE EVIDENCE'}</Text>
          </PressableScale>
        )}

        {item.details && (
          <>
            <Text style={[s.contextLabel, { marginTop: 12 }]}>THE COMPLAINT</Text>
            <Text style={s.contextValue}>{item.details}</Text>
          </>
        )}

        <Text style={[s.contextLabel, { marginTop: 12 }]}>REPORTED BY</Text>
        <Text style={s.contextValue}>@{reporterName}</Text>
      </View>

      {/* Enforcement History — only a real member has a record */}
      {!!item.target_user_id && <EnforcementHistory history={history} isLoading={recordLoading} failed={recordFailed} onRetry={reread && (() => { void reread(); })} />}

      {/* Action Row — hidden in multi-select mode */}
      {!multiSelectMode && (
        <View style={s.actionGrid}>
          <View style={s.actionRow}>
            <PressableScale touch="destructive" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              style={[s.actionBtn, { borderColor: colors.ash }, !item.target_user_id && { flex: 1 }]}
              onPress={() => handleDismiss(item)}
              haptic="selection"
              pressedScale={0.95}
              accessibilityRole="button"
              accessibilityLabel="Dismiss report"
            >
              <Check size={14} color={colors.fog} />
              <Text style={[s.actionText, { color: colors.fog }]}>DISMISS</Text>
            </PressableScale>

            {!!item.target_user_id && (
              <PressableScale touch="destructive" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                style={[s.actionBtn, { borderColor: colors.sepia, backgroundColor: 'rgba(184,137,26,0.08)' }]}
                onPress={() => openActionModal('warn', item)}
                haptic="selection"
                pressedScale={0.95}
                accessibilityRole="button"
                accessibilityLabel="Warn: issue a warning"
              >
                <AlertTriangle size={14} color={colors.sepia} />
                <Text style={[s.actionText, { color: colors.sepia }]}>WARN</Text>
              </PressableScale>
            )}
          </View>

          {/* Removing the reported piece — a different axis from the
              punishments below, so it stands on its own row. Still
              shown when the member has left, because their content
              can outlive them. On a page or a salon it takes what was
              written on it (a page's words, name, picture and links; a
              salon's name, description and cover), never the page or the
              room: a ban freezes the member's own page and salon, so
              without it a slur in a bio or a salon's name stood for as
              long as the ban did (round 14). */}
          {/* Not when the evidence is known destroyed: the piece is already gone, and
              a removal would remove nothing (the house refuses it, round 11). The
              case is then dismissed, or judged on its member. */}
          {!(ev?.data && !ev.data.found) && (
            <PressableScale touch="destructive" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              style={[s.actionBtn, { borderColor: colors.sepia, backgroundColor: 'rgba(184,137,26,0.08)' }]}
              onPress={() => openActionModal('delete_content', item)}
              haptic="medium"
              pressedScale={0.95}
              accessibilityRole="button"
              accessibilityLabel={item.content_type === 'profile' ? 'Remove content: clear the words on the page'
                : item.content_type === 'lounge' ? 'Remove content: clear the salon’s name and words'
                : 'Remove the reported content'}
            >
              <Trash2 size={14} color={colors.sepia} />
              <Text style={[s.actionText, { color: colors.sepia }]}>REMOVE CONTENT</Text>
            </PressableScale>
          )}

          {!!item.target_user_id && (
            <>
              <View style={s.actionRow}>
                <PressableScale touch="destructive" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  style={[s.actionBtn, { borderColor: colors.crimson, backgroundColor: 'rgba(180,45,45,0.08)' }]}
                  onPress={() => openActionModal('suspend', item)}
                  haptic="medium"
                  pressedScale={0.95}
                  accessibilityRole="button"
                  accessibilityLabel="Suspend member"
                >
                  <Clock size={14} color={colors.crimson} />
                  <Text style={[s.actionText, { color: colors.crimsonInk }]}>SUSPEND</Text>
                </PressableScale>

                <PressableScale touch="destructive" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  style={[s.actionBtn, { borderColor: colors.bloodReel, backgroundColor: 'rgba(107,26,10,0.12)' }]}
                  onPress={() => handleBanOrExile('ban', item)}
                  haptic="medium"
                  pressedScale={0.95}
                  accessibilityRole="button"
                  accessibilityLabel="Ban member"
                >
                  <Ban size={14} color={colors.crimson} />
                  <Text style={[s.actionText, { color: colors.crimsonInk }]}>BAN</Text>
                </PressableScale>
              </View>

              <PressableScale touch="destructive" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                style={[s.actionBtn, s.exileBtn]}
                onPress={() => handleBanOrExile('permanent_exile', item)}
                haptic="heavy"
                pressedScale={0.95}
                accessibilityRole="button"
                accessibilityLabel="Permanent exile: ban this member for good"
              >
                <Skull size={14} color={colors.crimson} />
                <Text style={[s.actionText, { color: colors.crimsonInk }]}>PERMANENT EXILE</Text>
              </PressableScale>
            </>
          )}
        </View>
      )}
      </View>
    </PressableScale>
  );
}, (was, now) => (Object.keys(now) as (keyof typeof now)[]).every((k) => (k === 'item' ? sameCase(was.item, now.item) : was[k] === now[k])));

// ── Action Modal ───────────────────────────────────────────────────────────

function ActionModal({
  state,
  onClose,
  onSubmit,
}: {
  state: ActionModalState;
  onClose: () => void;
  onSubmit: (action: EnforcementAction, reason: string, durationHours?: number) => void;
}) {
  // The reason is kept per case as it is written: a sheet closed, or a verdict the house refused,
  // opens on it again. Let go once sent; the Tribunal puts it back if the house refuses it.
  const userId = useAuthStore((st) => st.user?.id);
  const [reason, setReason, letGoReason] = useKeptWords(userId, 'verdict', state.report?.id);
  const [durationHours, setDurationHours] = useState('');
  const reasonRef = useRef<TextInput>(null);
  const sheetFoot = useSheetBottom();

  const handleClose = useCallback(() => {
    setDurationHours('');
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(() => {
    if (!state.action || !reason.trim()) return;
    const hours = state.action === 'suspend' ? parseInt(durationHours, 10) : undefined;
    if (state.action === 'suspend' && (!hours || hours <= 0)) {
      reelToast.error('Duration must be a positive number of hours.');
      return;
    }
    // Told to the member in their notice: cleaned, and kept to what that notice can hold.
    onSubmit(state.action, sanitizeInput(reason, 'modReason'), hours);
    letGoReason();
    setDurationHours('');
  }, [state.action, reason, durationHours, onSubmit, letGoReason]);

  // Two colours per verdict, because the verdict is drawn twice. `color` is the
  // FILL of the button — crimson pigment, with parchment on it at 4.74:1. `ink`
  // is the title's WORDS on the sheet, where that same crimson measures 2.78:1.
  // One value for both jobs was always going to fail one of them: moving the
  // fill to the lighter ink drops the button's own label to 2.65.
  const actionLabels: Record<EnforcementAction, { title: string; color: string; ink: string; description: string }> = {
    warn: {
      title: 'ISSUE WARNING',
      color: colors.sepia,
      ink: colors.sepia,
      description: 'A formal warning will be recorded and the member notified.',
    },
    suspend: {
      title: 'SUSPEND MEMBER',
      color: colors.crimson,
      ink: colors.crimsonInk,
      description: 'Temporarily restrict access for the specified duration.',
    },
    ban: {
      title: 'BAN MEMBER',
      color: colors.crimson,
      ink: colors.crimsonInk,
      description: 'Revoke access until an admin lifts the ban (SANCTIONS). The member may appeal it once.',
    },
    // No admin lifts an exile; the member's one appeal, heard by another moderator, alone may strike it.
    permanent_exile: {
      title: 'PERMANENT EXILE',
      color: colors.crimson,
      ink: colors.crimsonInk,
      description: 'Expulsion from the Society for good: no admin may lift it. The member may appeal it once, to another moderator.',
    },
    // The only action here that addresses the WORK rather than the member.
    // Sepia, not crimson: this is correction, not punishment, and it is usually
    // the right first answer to a report about one bad piece.
    delete_content: {
      title: 'REMOVE CONTENT',
      color: colors.sepia,
      ink: colors.sepia,
      // A log, a stack, a critique or a filing is withheld whole, never deleted at once (round 14): an
      // overturned verdict gives it back with its critiques and marks.
      description:
        'The reported piece is withheld at once: no one but its author sees it, its critiques and marks with it. It is deleted when its appeal is upheld, or when 30 days pass unappealed; overturned, it returns whole. A lounge dispatch is struck through rather than erased, so the conversation around it still reads. A copy is kept with the record, should the decision be appealed.',
    },
  };

  if (!state.action) return null;
  const config = actionLabels[state.action];
  // A page and a salon are no piece: what a removal takes from each is said for each (round 14).
  const removing = state.action === 'delete_content' ? state.report?.content_type : null;
  const description = removing === 'profile'
    ? 'The member’s words on their page are cleared: bio, display name, picture and links. Their handle stays (a ban answers that). A copy is kept with the record, should the decision be appealed.'
    : removing === 'lounge'
      ? 'The salon’s name, description and cover are cleared; its rooms and the words members left in them stay. A copy is kept with the record, should the decision be appealed.'
      : config.description;

  return (
    <Modal statusBarTranslucent visible={state.visible} transparent animationType="fade" onRequestClose={handleClose}>
      <InColumn scrim={{ color: 'rgba(0,0,0,0.7)' }}>
      <KeyboardAvoidingView
        onAccessibilityEscape={handleClose}
        style={s.modalOverlay}
        // 'padding' on BOTH platforms: RN Modal windows never resize for the
        // keyboard (Android's resize mode can't reach them).
        behavior="padding"
      >
        <View style={[s.modalSheet, { paddingBottom: sheetFoot }]}>
          <View style={s.modalHandle} />

          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: config.ink }]}>{config.title}</Text>
            <PressableScale touch="wayOut" onPress={handleClose} haptic="selection" pressedScale={0.9}
              accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color={colors.fog} />
            </PressableScale>
          </View>

          <Text style={s.modalDescription}>{description}</Text>

          {state.action === 'suspend' && (
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>DURATION (HOURS)</Text>
              <TextInput
                style={s.textInput}
                value={durationHours}
                onChangeText={setDurationHours}
                maxLength={HOURS_DIGITS}
                keyboardType="numeric"
                placeholder="e.g. 24, 48, 72"
                placeholderTextColor={colors.fog}
                selectionColor={colors.selection}
                returnKeyType="next"
                // On to the reason: Enter goes where the form goes next.
                onSubmitEditing={() => reasonRef.current?.focus()}
                blurOnSubmit={false}
                accessibilityLabel="Suspension, in hours"
              />
            </View>
          )}

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>REASON</Text>
            <TextInput
              ref={reasonRef}
              style={[s.textInput, s.textArea]}
              value={reason}
              onChangeText={setReason}
              placeholder="Describe the reason for this action..."
              placeholderTextColor={colors.fog}
              selectionColor={colors.selection}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={MAX_LENGTHS.modReason}
              accessibilityLabel="Reason for this action"
            />
          </View>

          <PressableScale touch="destructive"
            style={[s.submitBtn, { backgroundColor: config.color }, !reason.trim() && UNREADY.plate]}
            onPress={handleSubmit}
            disabled={!reason.trim()}
            haptic="medium"
            pressedScale={0.97}
            accessibilityRole="button"
            // Named by the words it shows, then the verdict: a Voice Control moderator says
            // "Tap Render Verdict" (named "Execute …", it heard nothing, round 12).
            accessibilityLabel={`Render verdict: ${config.title.toLowerCase()}`}
          >
            <Text style={[s.submitBtnText, !reason.trim() && UNREADY.words]}>RENDER VERDICT</Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
      <ToastHost />
      </InColumn>
    </Modal>
  );
}

// ── Main Tribunal Screen ───────────────────────────────────────────────────

/**
 * The Tribunal behind its door (P0.94): nothing of it is read or drawn until this
 * session has given the second key (src/components/admin/SecondKeyDoor.tsx).
 */
export default function Tribunal() {
  const user = useAuthStore((s) => s.user);
  // A member who is no admin never meets the door: there is nothing behind it for them.
  if (!user || user.role !== 'admin') return <View style={s.container}><RoomLight room="default" /></View>;
  return (
    <SecondKeyDoor userId={user.id}>
      <TribunalScreen />
    </SecondKeyDoor>
  );
}

function TribunalScreen() {
  const user = useAuthStore((s) => s.user);
  const headerTop = usePushedHeaderTop();
  const end = useContentBottom();
  const queryClient = useQueryClient();

  const [actionModal, setActionModal] = useState<ActionModalState>({
    visible: false,
    action: null,
    report: null,
  });

  // ── View toggle: pending vs priority ───────────────────────────────────
  const [activeView, setActiveView] = useState<TribunalView>('pending');

  // ── Multi-select state ─────────────────────────────────────────────────
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  // ── Priority queue pagination state ────────────────────────────────────
  // No cursor state: the load-more cursor is derived from the last loaded
  // item, and the live query rebuilds the docket as far as it was read (see below), so a
  // verdict's refetch always rebuilds a fresh docket — same pattern as pending.
  const [priorityItems, setPriorityItems] = useState<TribunalReport[]>([]);
  const [hasMorePriority, setHasMorePriority] = useState(true);

  // ── Pending docket pagination state ────────────────────────────────────
  const [pendingItems, setPendingItems] = useState<TribunalReport[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);

  // ── Summoned evidence, per case ─────────────────────────────────────────
  const [evidence, setEvidence] = useState<Record<string, { loading: boolean; data?: ReportEvidence }>>({});

  // How far each docket has been read: a verdict's read again reads this far, not page one alone.
  const pendingAsFar = useRef(REPORTS_PAGE_SIZE);
  const priorityAsFar = useRef(PRIORITY_PAGE);

  const {
    data: pendingPage,
    isLoading,
    isRefetching: refreshing,
    refetch,
    // A failed docket used to render as an EMPTY one — see `queueFailed` below.
    isError: pendingFailed,
  } = useQuery({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: () => readPendingAsFar(pendingAsFar.current),
    enabled: user?.role === 'admin',
  });

  // The read (and every read again after a verdict) rebuilds the docket as far as it was read —
  // during the render that brings it, not in an effect after: the frame between painted the answer
  // as an empty docket.
  const [pendingFrom, setPendingFrom] = useState<typeof pendingPage>(undefined);
  if (pendingPage && pendingPage !== pendingFrom) {
    setPendingFrom(pendingPage);
    setPendingItems(pendingPage.rows);
    setPendingTotal(pendingPage.total ?? pendingPage.rows.length);
  }
  useEffect(() => { pendingAsFar.current = Math.max(REPORTS_PAGE_SIZE, pendingItems.length); }, [pendingItems.length]);

  // ── Load more for the pending docket (keyset on created_at) ────────────
  const loadMorePendingMutation = useMutation({
    mutationFn: (cursor: string) => ModerationService.getPendingReports(cursor),
    onSuccess: (page) => {
      const rows = page.rows as unknown as TribunalReport[];
      if (rows.length > 0) {
        setPendingItems(prev => {
          const seen = new Set(prev.map(r => r.id));
          return [...prev, ...rows.filter(r => !seen.has(r.id))];
        });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Could not retrieve earlier cases.';
      reelToast.error(msg);
    },
  });

  const handleLoadMorePending = useCallback(() => {
    if (pendingItems.length === 0 || loadMorePendingMutation.isPending) return;
    loadMorePendingMutation.mutate(pendingItems[pendingItems.length - 1].created_at);
  }, [pendingItems, loadMorePendingMutation]);

  // ── Summon the evidence for one case ────────────────────────────────────
  const summonEvidence = useCallback(async (reportId: string) => {
    TactileEngine.selection();
    setEvidence(prev => ({ ...prev, [reportId]: { loading: true, data: prev[reportId]?.data } }));
    try {
      const data = await ModerationService.getReportEvidence(reportId);
      setEvidence(prev => ({ ...prev, [reportId]: { loading: false, data } }));
    } catch (err: unknown) {
      setEvidence(prev => ({ ...prev, [reportId]: { loading: false } }));
      const msg = err instanceof Error ? err.message : 'The clerk could not retrieve the exhibit.';
      reelToast.error(msg);
    }
  }, []);

  // ── Priority Queue query ───────────────────────────────────────────────
  const {
    data: priorityData,
    isLoading: priorityLoading,
    isRefetching: priorityRefreshing,
    refetch: refetchPriority,
    isError: priorityFailed,
  } = useQuery({
    queryKey: ['admin', 'reports', 'priority'],
    queryFn: () => readAsFar(readPriority, priorityCursorOf, priorityAsFar.current, PRIORITY_PAGE),
    enabled: user?.role === 'admin' && activeView === 'priority',
  });

  // The live query, read as far as the docket was read: whenever priorityData changes (initial
  // load, a verdict's invalidation, manual refresh) it rebuilds the docket. Load-more appends via a
  // mutation that never touches priorityData, and the next read again reads that far — so a
  // refetch (including resolving the last case → []) is always reflected, never stale. Rebuilt
  // during the render that brings it, as the pending docket is: never a frame of an empty docket
  // over an answered read.
  const [priorityFrom, setPriorityFrom] = useState<typeof priorityData>(undefined);
  if (priorityData && priorityData !== priorityFrom) {
    setPriorityFrom(priorityData);
    setPriorityItems(priorityData);
    setHasMorePriority(moreMayFollow(priorityData, PRIORITY_PAGE));
  }
  useEffect(() => { priorityAsFar.current = Math.max(PRIORITY_PAGE, priorityItems.length); }, [priorityItems.length]);

  // ── Enforcement records for the WHOLE docket, in one query ──────────────────
  // Keyed on the accumulated ids, not on page one. The docket grows by appending
  // pages, so a fetch tied to the first page would leave every later card with an
  // empty record — the failure mode a naive batch would have introduced.
  // Both dockets' members: THE DOCKET, where the Tribunal opens, read none, and every case there
  // drew no record, a repeat offender read as a first offence (round 14).
  // Read as the members come: the members a page of a docket brings are read together, keyed on
  // themselves, once. A page more reads only the members it brought, never every record already held.
  const onDocket = React.useMemo(
    () => [...new Set([...pendingItems, ...priorityItems].map(r => r.target_user_id).filter(Boolean))] as string[],
    [pendingItems, priorityItems],
  );
  const [recordPages, setRecordPages] = useState<string[][]>([]);
  const recordPlace = React.useMemo(
    () => new Map(recordPages.flatMap((ids, page) => ids.map((id) => [id, page] as const))),
    [recordPages],
  );
  const newcomers = onDocket.filter((id) => !recordPlace.has(id));
  if (newcomers.length > 0) {
    setRecordPages((pages) => {
      const held = new Set(pages.flat());
      const brought = newcomers.filter((id) => !held.has(id));
      return brought.length > 0 ? [...pages, brought] : pages;
    });
  }
  const recordReads = useQueries({
    queries: recordPages.map((ids) => ({
      queryKey: ['admin', 'moderation-history', ids],
      queryFn: () => ModerationService.getModerationHistoryForUsers(ids),
      enabled: user?.role === 'admin',
    })),
  });
  const historyByUser: Record<string, ModActionRecord[]> = Object.assign({}, ...recordReads.map((q) => q.data ?? {}));
  const readOf = (memberId: string) => {
    const page = recordPlace.get(memberId);
    return page === undefined ? undefined : recordReads[page];
  };
  // A member whose page is not yet read reads "Retrieving", never a clean record.
  const recordReading = (memberId: string) => {
    const q = readOf(memberId);
    return !q || q.isLoading;
  };
  const recordFailed = (memberId: string) => !!readOf(memberId)?.isError;

  // ── Load More for priority queue (compound keyset — matches RPC order) ──
  const loadMoreMutation = useMutation({
    mutationFn: (cursor: PriorityCursor) => readPriority(cursor, PRIORITY_PAGE),
    onSuccess: (rows) => {
      if (rows.length > 0) {
        setPriorityItems((prev) => {
          const seen = new Set(prev.map(r => r.id));
          return [...prev, ...rows.filter(r => !seen.has(r.id))];
        });
        setHasMorePriority(rows.length >= PRIORITY_PAGE);
      } else {
        setHasMorePriority(false);
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to load more reports.';
      reelToast.error(msg);
    },
  });

  const handleLoadMore = useCallback(() => {
    if (priorityItems.length === 0 || loadMoreMutation.isPending) return;
    loadMoreMutation.mutate(priorityCursorOf(priorityItems[priorityItems.length - 1]));
  }, [priorityItems, loadMoreMutation]);

  // A judged case leaves both dockets at once. The read again of page one rebuilds a docket only
  // when it changed, and a case judged on a page loaded later left page one as it was: the read
  // handed back the same rows, nothing was rebuilt, and the case stood, to be refused when judged
  // again (review round 7). A verdict closes the one report it names.
  const leaveTheDocket = useCallback((ids: string[]) => {
    const judged = new Set(ids);
    setPriorityItems((prev) => prev.filter((r) => !judged.has(r.id)));
    setPendingItems((prev) => prev.filter((r) => !judged.has(r.id)));
  }, []);

  // ── Resolve V2 Mutation (for graduated actions) ────────────────────────

  const resolveV2Mutation = useMutation({
    mutationFn: ({
      reportId,
      action,
      reason,
      durationHours,
    }: {
      reportId: string;
      action: ModAction;
      reason: string;
      durationHours?: number;
    }) =>
      ModerationService.resolveReportV2(reportId, action, {
        admin_id: user!.id,
        reason,
        duration_hours: durationHours,
        notify_user: true,
      }),
    onSuccess: (_answer, { reportId }) => {
      leaveTheDocket([reportId]);
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'priority'] });
      // The member's record has a verdict more, and the door below one case fewer (round 14).
      void queryClient.invalidateQueries({ queryKey: ['admin', 'moderation-history'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tribunal-waiting'] });
      TactileEngine.success();
      reelToast('Directive executed. Action recorded in the archives.');
    },
    onError: (err: unknown, { reportId, reason }) => {
      const refused = verdictRefusal(err);
      // Judged by another moderator meanwhile (or a bulk dismissal): the case is settled, so it
      // leaves the docket, and both dockets are read again for whatever else changed (review round 11).
      if (refused === 'ALREADY_JUDGED') {
        leaveTheDocket([reportId]);
        // Read again behind the toast: a docket that fails to read says so itself.
        void queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'pending'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'priority'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'tribunal-waiting'] });
        reelToast('Already judged by another moderator.');
        return;
      }
      // The piece was deleted before the verdict: nothing was removed, recorded or told, and the
      // case stays. Its evidence now reads as destroyed, so REMOVE CONTENT is no longer offered; the
      // words as reported stay beside it, to judge the member on (round 14).
      // The case stays: its reason is put back, to open on again.
      putBackWords(user?.id, 'verdict', reportId, reason);
      if (refused === 'PIECE_GONE') {
        setEvidence(prev => ({ ...prev, [reportId]: { loading: false, data: { found: false, reported: prev[reportId]?.data?.reported } } }));
        reelToast.error('The piece is already gone. Dismiss the case, or judge the member.');
        return;
      }
      // A case about this moderator: it stays on the docket, for another moderator.
      if (refused === 'OWN_CASE') {
        reelToast.error(OWN_CASE_SAID);
        return;
      }
      const msg = err instanceof Error ? err.message : 'The Tribunal directive could not be executed.';
      reelToast.error(msg);
    },
  });

  // ── Bulk dismiss mutation ──────────────────────────────────────────────

  const bulkDismissMutation = useMutation({
    mutationFn: (reportIds: string[]) =>
      ModerationService.bulkDismiss(reportIds, user!.id, 'Bulk dismissed by Tribunal admin'),
    onSuccess: (closed, reportIds) => {
      // Every case named is settled now, closed by this call or judged by another moderator before
      // it (the house closes only pending ones), but a case about this moderator, which the house
      // leaves pending for another: those stay, and the rest leave the docket. The toast counts only
      // what this call closed (review round 11).
      const own = new Set([...pendingItems, ...priorityItems].filter((r) => r.target_user_id && r.target_user_id === user?.id).map((r) => r.id));
      const settled = reportIds.filter((id) => !own.has(id));
      leaveTheDocket(settled);
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'priority'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'moderation-history'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'tribunal-waiting'] });
      TactileEngine.success();
      reelToast(bulkDismissedWords(settled.length, closed, reportIds.length - settled.length));
      setSelectedReports(new Set());
      setMultiSelectMode(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Bulk dismiss failed.';
      reelToast.error(msg);
    },
  });

  // ── Multi-select handlers ──────────────────────────────────────────────

  const toggleMultiSelect = useCallback(() => {
    TactileEngine.mutate();
    setMultiSelectMode((prev) => {
      if (prev) setSelectedReports(new Set());
      return !prev;
    });
  }, []);

  const toggleReportSelection = useCallback((reportId: string) => {
    TactileEngine.selection();
    setSelectedReports((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  }, []);

  const handleBulkDismiss = useCallback(() => {
    if (selectedReports.size === 0) return;
    TactileEngine.destroy();
    Alert.alert(
      'Bulk Dismiss',
      `Dismiss ${selectedReports.size} report(s) without action?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss All',
          style: 'destructive',
          onPress: () => bulkDismissMutation.mutate(Array.from(selectedReports)),
        },
      ],
    );
  }, [selectedReports, bulkDismissMutation]);

  // ── View toggle handler ────────────────────────────────────────────────

  const switchView = useCallback((view: TribunalView) => {
    TactileEngine.selection();
    setActiveView(view);
    setMultiSelectMode(false);
    setSelectedReports(new Set());
    // Back to its first page, from the answer held: emptied, it waited for a read that brought a
    // DIFFERENT answer, and within the query's fresh window (or a read finding the same cases,
    // handed back as the same object) none came, so the docket said "clear" over waiting cases.
    if (view === 'priority') setPriorityFrom(undefined);
  }, []);

  const onRefresh = useCallback(async () => {
    TactileEngine.navigate();
    if (activeView === 'pending') {
      const r = await refetch();
      // The docket stays as it was; a pull that reached nothing says so.
      if (r.isError) reelToast.error(REFRESH_FAILED);
    } else {
      // Back to its first page as held, then as read again; a pull that reached nothing says so.
      setPriorityFrom(undefined);
      const r = await refetchPriority();
      if (r.isError) reelToast.error(REFRESH_FAILED);
    }
  }, [refetch, refetchPriority, activeView]);

  // ── Open action modal for graduated enforcement ────────────────────────

  const openActionModal = useCallback((action: EnforcementAction, report: TribunalReport) => {
    TactileEngine.mutate();
    setActionModal({ visible: true, action, report });
  }, []);

  // ── Handle ban/exile with confirmation Alert ───────────────────────────

  const handleBanOrExile = useCallback(
    (action: 'ban' | 'permanent_exile', report: TribunalReport) => {
      TactileEngine.destroy();
      const title = action === 'ban' ? 'Ban Member' : 'Permanent Exile';
      const message =
        action === 'ban'
          ? 'This will ban the member from the Society until an admin lifts it. Are you certain?'
          : 'PERMANENT EXILE cannot be lifted by any admin. The member is expelled for good, unless their one appeal is granted by another moderator. Proceed?';

      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: () => openActionModal(action, report),
        },
      ]);
    },
    [openActionModal],
  );

  // ── Handle dismiss via the admin-verified v2 resolver ───────────────────

  // The resolver's own call, the same across renders (the mutation's result is a new object each
  // render): a case's DISMISS keeps its identity, so the case is not drawn again for it.
  const resolveCase = resolveV2Mutation.mutate;
  const handleDismiss = useCallback(
    (report: TribunalReport) => {
      TactileEngine.navigate();
      Alert.alert('Dismiss Report', 'Dismiss this report without action?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          onPress: () =>
            resolveCase({
              reportId: report.id,
              action: 'dismiss',
              reason: 'Dismissed by Tribunal admin',
            }),
        },
      ]);
    },
    [resolveCase],
  );

  // ── Handle modal submission ────────────────────────────────────────────

  const handleActionSubmit = useCallback(
    (action: EnforcementAction, reason: string, durationHours?: number) => {
      if (!actionModal.report) return;
      TactileEngine.warn();
      resolveV2Mutation.mutate({
        reportId: actionModal.report.id,
        action,
        reason,
        durationHours,
      });
      setActionModal({ visible: false, action: null, report: null });
    },
    [actionModal.report, resolveV2Mutation],
  );

  // ── Guard: admin only ──────────────────────────────────────────────────

  if (user?.role !== 'admin') return <View style={s.container}><RoomLight room="default" /></View>;

  // ── Determine which data to show ──────────────────────────────────────

  const displayData: TribunalReport[] = activeView === 'pending' ? pendingItems : priorityItems;
  const isLoadingData = activeView === 'pending' ? isLoading : priorityLoading;

  /**
   * Did the read behind the visible tab FAIL? A queue is the one screen where
   * "nothing here" must be trustworthy, so both tabs say so. (The record beside
   * a case says its own failure, in EnforcementHistory.)
   */
  const queueFailed = activeView === 'pending' ? pendingFailed : priorityFailed;
  const retryQueue = activeView === 'pending' ? refetch : refetchPriority;
  const isRefreshingData = activeView === 'pending' ? refreshing : priorityRefreshing;
  const pendingRemaining = Math.max(pendingTotal - pendingItems.length, 0);

  return (
    <View style={s.container}>
      <RoomLight room="default" />
      <LinearGradient
        colors={['rgba(180,45,45,0.10)', colors.ink]}
        style={[StyleSheet.absoluteFill, WASH]}
      />

      <Arrive name="tribunal-1" duration={600} style={[s.header, { paddingTop: headerTop }]}>
        <PressableScale touch="wayOut"
          onPress={() => nav.back()}
          style={s.backBtn}
          haptic="selection"
          pressedScale={0.92}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={colors.bone} />
        </PressableScale>
        <Scale size={28} color={colors.crimson} style={{ marginBottom: 16 }} />
        <Text style={s.eyebrow}>THE HOUSE CONVENES</Text>
        <Text style={s.title}>The Tribunal</Text>
        <Text style={s.subtitle}>
          {/* Unread is not none: a failed docket counts nothing. */}
          {pendingFailed && !pendingPage
            ? 'The docket could not be read'
            : pendingTotal === 1 ? '1 matter awaits judgment' : `${pendingTotal} matters await judgment`}
        </Text>

        {/* ── View Toggle Tabs ─────────────────────────────────────────── */}
        <View style={s.viewToggleRow}>
          <PressableScale
            hitSlop={VIEW_TAB_SLOP}
            style={[s.viewTab, activeView === 'pending' && s.viewTabActive]}
            onPress={() => switchView('pending')}
            haptic="selection"
            pressedScale={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'pending' }}
            accessibilityLabel="The docket: pending reports"
          >
            <List size={14} color={activeView === 'pending' ? colors.parchment : colors.fog} />
            <Text style={[s.viewTabText, activeView === 'pending' && s.viewTabTextActive]}>
              THE DOCKET
            </Text>
          </PressableScale>

          <PressableScale
            hitSlop={VIEW_TAB_SLOP}
            style={[s.viewTab, activeView === 'priority' && s.viewTabActive]}
            onPress={() => switchView('priority')}
            haptic="selection"
            pressedScale={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'priority' }}
            accessibilityLabel="Urgent: the priority queue"
          >
            <Layers size={14} color={activeView === 'priority' ? colors.parchment : colors.fog} />
            <Text style={[s.viewTabText, activeView === 'priority' && s.viewTabTextActive]}>
              URGENT
            </Text>
          </PressableScale>

          {/* The members' appeals of the house's verdicts, heard by a moderator other than the one
              who ruled; and the bans and suspensions standing, to lift (round 14). */}
          <PressableScale
            hitSlop={VIEW_TAB_SLOP}
            style={[s.viewTab, activeView === 'appeals' && s.viewTabActive]}
            onPress={() => switchView('appeals')}
            haptic="selection"
            pressedScale={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'appeals' }}
            accessibilityLabel="Appeals: the members' appeals of verdicts"
          >
            <Gavel size={14} color={activeView === 'appeals' ? colors.parchment : colors.fog} />
            <Text style={[s.viewTabText, activeView === 'appeals' && s.viewTabTextActive]}>
              APPEALS
            </Text>
          </PressableScale>

          <PressableScale
            hitSlop={VIEW_TAB_SLOP}
            style={[s.viewTab, activeView === 'sanctions' && s.viewTabActive]}
            onPress={() => switchView('sanctions')}
            haptic="selection"
            pressedScale={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'sanctions' }}
            accessibilityLabel="Sanctions: the bans and suspensions standing"
          >
            <Lock size={14} color={activeView === 'sanctions' ? colors.parchment : colors.fog} />
            <Text style={[s.viewTabText, activeView === 'sanctions' && s.viewTabTextActive]}>
              SANCTIONS
            </Text>
          </PressableScale>
        </View>

        {/* ── Multi-select toolbar ────────────────────────────────────── */}
        {activeView === 'pending' && (
          <View style={s.toolbarRow}>
            <PressableScale
              hitSlop={TOOLBAR_SLOP}
              style={[s.toolbarBtn, multiSelectMode && s.toolbarBtnActive]}
              onPress={toggleMultiSelect}
              haptic="selection"
              pressedScale={0.95}
              accessibilityRole="button"
              // Named with the word it shows: SELECTING, while it is on.
              accessibilityLabel={multiSelectMode ? 'Selecting: exit multi-select mode' : 'Enter multi-select mode'}
            >
              {multiSelectMode ? (
                <CheckSquare size={14} color={colors.sepia} />
              ) : (
                <Square size={14} color={colors.fog} />
              )}
              <Text style={[s.toolbarBtnText, multiSelectMode && s.toolbarBtnTextActive]}>
                {multiSelectMode ? 'SELECTING' : 'SELECT'}
              </Text>
            </PressableScale>

            {multiSelectMode && selectedReports.size > 0 && (
              <PressableScale touch="destructive"
                style={s.bulkDismissBtn}
                onPress={handleBulkDismiss}
                haptic="medium"
                pressedScale={0.95}
                disabled={bulkDismissMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Bulk dismiss ${counted(selectedReports.size, 'report', 'reports')}`}
              >
                {bulkDismissMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.parchment} />
                ) : (
                  <>
                    <X size={14} color={colors.parchment} />
                    <Text style={s.bulkDismissBtnText}>
                      BULK DISMISS ({selectedReports.size})
                    </Text>
                  </>
                )}
              </PressableScale>
            )}
          </View>
        )}
      </Arrive>

      {activeView === 'appeals' ? (
        <AppealsDocket adminId={user.id} end={end} />
      ) : activeView === 'sanctions' ? (
        <SanctionsList end={end} />
      ) : (
      <ScrollView
        contentContainerStyle={[s.listContent, { paddingBottom: end }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshingData} onRefresh={onRefresh} tintColor={colors.crimson} />
        }
      >
        {isLoadingData ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>Gathering the docket…</Text>
          </View>
        ) : queueFailed ? (
          // Checked BEFORE the empty branch, which is the whole point: an empty
          // list and an unanswered question look identical from here, and only
          // one of them means there is nothing to do.
          <View style={s.emptyState}>
            <Scale size={48} color={colors.crimson} style={{ opacity: 0.6, marginBottom: 16 }} />
            <Text style={s.emptyText}>The docket could not be read.</Text>
            <Text style={[s.emptyText, { fontSize: 12, color: colors.fogQuiet, marginTop: 6 }]}>
              This is not an empty queue — nothing was loaded.
            </Text>
            <PressableScale
              style={s.retryBtn}
              onPress={() => { void retryQueue(); }}
              pressedScale={0.97}
              haptic="medium"
              accessibilityRole="button"
              accessibilityLabel="Try again: read the docket"
            >
              <Text style={s.retryBtnText}>TRY AGAIN</Text>
            </PressableScale>
          </View>
        ) : displayData.length === 0 ? (
          <View style={s.emptyState}>
            <Scale size={48} color={colors.ash} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Text style={s.emptyText}>The docket is clear. The house rests.</Text>
          </View>
        ) : null}

        {/* A closed case slides out over the docket closing up behind it. */}
        <Presence>
            {!isLoadingData && !queueFailed && displayData.map((item, index) => (
              <PresenceView
                key={item.id}
                name="tribunal.case"
                enter={{ kind: 'FadeInUp', duration: 400, delay: Math.min(index * 50, 400) }}
                exit={{ kind: 'SlideOutRight' }}
              >
                <DocketCase
                  item={item}
                  multiSelectMode={multiSelectMode}
                  isSelected={selectedReports.has(item.id)}
                  ev={evidence[item.id]}
                  history={(item.target_user_id && historyByUser[item.target_user_id]) || NO_RECORD}
                  recordLoading={!!item.target_user_id && recordReading(item.target_user_id)}
                  recordFailed={!!item.target_user_id && recordFailed(item.target_user_id)}
                  reread={item.target_user_id ? readOf(item.target_user_id)?.refetch : undefined}
                  toggleReportSelection={toggleReportSelection}
                  summonEvidence={summonEvidence}
                  handleDismiss={handleDismiss}
                  openActionModal={openActionModal}
                  handleBanOrExile={handleBanOrExile}
                />
              </PresenceView>
            ))}
        </Presence>

        {!isLoadingData && !queueFailed && displayData.length > 0 && (
          <>
            {/* ── Load More (pending docket — exact remainder) ──────────── */}
            {activeView === 'pending' && pendingRemaining > 0 && (
              <PressableScale
                style={s.loadMoreBtn}
                onPress={handleLoadMorePending}
                haptic="selection"
                pressedScale={0.97}
                disabled={loadMorePendingMutation.isPending}
                accessibilityRole="button"
                // Its name holds the words it shows ("LOAD EARLIER · N MORE"), as a voice control is spoken to.
                accessibilityLabel={`Load earlier: ${pendingRemaining} more`}
              >
                {loadMorePendingMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.sepia} />
                ) : (
                  <Text style={s.loadMoreText}>✦ LOAD EARLIER · {pendingRemaining} MORE</Text>
                )}
              </PressableScale>
            )}

            {/* ── Load More (priority queue cursor pagination) ─────────── */}
            {activeView === 'priority' && hasMorePriority && priorityItems.length > 0 && (
              <PressableScale
                style={s.loadMoreBtn}
                onPress={handleLoadMore}
                haptic="selection"
                pressedScale={0.97}
                disabled={loadMoreMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Load more priority reports"
              >
                {loadMoreMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.sepia} />
                ) : (
                  <Text style={s.loadMoreText}>✦ LOAD MORE CASES</Text>
                )}
              </PressableScale>
            )}
          </>
        )}
      </ScrollView>
      )}

      {/* Action Modal */}
      <ActionModal
        state={actionModal}
        onClose={() => setActionModal({ visible: false, action: null, report: null })}
        onSubmit={handleActionSubmit}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

/**
 * THE DOCKET and URGENT sit VIEW_GAP apart, and the toolbar TOOLBAR_GAP below
 * them. Each control reaches half the gap toward its neighbour, no more — at
 * the default 15 the tabs overlapped by 22pt and the later one took the tap.
 */
const VIEW_GAP = 8;
const TOOLBAR_GAP = 12;
// Four tabs, two rows of two (round 14): each reaches half the gap toward every neighbour, the row
// below it included; each is 48 tall by its own box, so the reach is courtesy, never size.
const VIEW_TAB_SLOP = { top: VIEW_GAP / 2, bottom: VIEW_GAP / 2, left: VIEW_GAP / 2, right: VIEW_GAP / 2 };
const TOOLBAR_SLOP = { top: TOOLBAR_GAP / 2, bottom: 15, left: 4, right: 4 };

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(180,45,45,0.25)',
  },
  backBtn: { alignSelf: 'flex-start', padding: 8, marginLeft: -8, marginBottom: 16 },
  eyebrow: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 4,
    color: colors.crimsonInk,
    marginBottom: 6,
  },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, marginBottom: 4 },
  subtitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.fog },

  // Its foot is the page's (useContentBottom), set where it is drawn.
  listContent: { padding: 16 },
  reportCard: { ...EDGE_LIT,
    backgroundColor: colors.soot,
    borderRadius: radii.sm,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.ash,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportMeta: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: {
    backgroundColor: 'rgba(180,45,45,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(180,45,45,0.35)',
  },
  typeBadgeText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.crimsonInk },

  reasonTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 14 },

  // ── The Accused ────────────────────────────────────────────────────────
  accusedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  accusedAvatar: {
    width: 26, height: 26, borderRadius: 13, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.ash,
  },
  accusedAvatarImg: { width: '100%', height: '100%' },
  accusedAvatarLetter: { fontFamily: fonts.sub, fontSize: 11, color: colors.sepia, includeFontPadding: false },
  accusedInfo: { flex: 1 },
  accusedLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.fog },
  accusedName: { fontFamily: fonts.sub, fontSize: 13, color: colors.sepia, marginTop: 1 },
  accusedUnknown: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, marginTop: 2 },

  // ── The Evidence ───────────────────────────────────────────────────────
  detailsBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
  },
  contextLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.fogQuiet,
    marginBottom: 4,
  },
  contextValue: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 19 },
  evidenceTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, marginBottom: 4 },
  evidenceOpen: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia, marginTop: 8 },
  evidenceDestroyed: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog },
  // The words as reported, set off from the piece as it stands (round 14).
  asReported: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.ash },
  exhibitSaid: { color: colors.sepia },
  exhibitPicture: { width: 64, height: 64, borderRadius: 2, marginVertical: 6, backgroundColor: 'rgba(0,0,0,0.35)' },
  exhibitGone: { fontFamily: fonts.bodyItalic, fontSize: 12, color: colors.fog, marginVertical: 6 },
  summonBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderStyle: 'dashed',
    borderRadius: 3, paddingVertical: 10,
  },
  summonText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.sepia },

  // ── Action Grid ────────────────────────────────────────────────────────
  actionGrid: { gap: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  // A verdict is a step a slip on costs most: 48 tall by its own box, 8 from the next.
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingVertical: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  actionText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2 },
  exileBtn: {
    borderColor: colors.bloodReel,
    backgroundColor: 'rgba(107,26,10,0.08)',
    borderStyle: 'dashed' as any,
  },

  // ── Warning Badge ──────────────────────────────────────────────────────
  warningBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(184,137,26,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.sepia,
  },
  warningBadgeText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.sepia,
  },

  // ── Report Count Badge ─────────────────────────────────────────────────
  reportCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(180,45,45,0.14)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.crimson,
  },
  reportCountBadgeText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.crimsonInk,
  },

  // ── Enforcement History ────────────────────────────────────────────────
  historyContainer: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ash,
  },
  historyLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.fog,
    marginBottom: 8,
  },
  historyEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.fog },
  // Its box grown to 48 reaches below its words: kept clear of DISMISS's reach beneath (the touch sweep).
  historyRetry: { marginTop: 6, marginBottom: 8, alignSelf: 'flex-start' },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  historyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.sepia,
    marginTop: 4,
  },
  // A verdict struck (overturned, lifted): its dot hollow, the words beside it say which.
  historyDotStruck: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.fog },
  historyContent: { flex: 1 },
  historyAction: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.bone,
  },
  historyReason: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, marginTop: 2 },
  historyDate: { fontFamily: fonts.sub, fontSize: 10, color: colors.fogQuiet, marginTop: 2 },

  // ── Modal ──────────────────────────────────────────────────────────────
  // Its ground is the scrim InColumn draws across the window.
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.15)',
    padding: spacing.lg,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: 1,
  },
  modalDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.fog,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },

  // ── Inputs ─────────────────────────────────────────────────────────────
  inputGroup: { marginBottom: spacing.md },
  inputLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.fog,
    marginBottom: 6,
  },
  textInput: { borderBottomWidth: 1, borderBottomColor: colors.fieldEdge,
    backgroundColor: colors.well,
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: radii.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.parchment,
    padding: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 16,
    borderRadius: radii.sm,
    marginTop: spacing.md,
  },
  submitBtnText: {
    fontFamily: fonts.sub,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.parchment,
  },

  // ── Empty State ────────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: fonts.sub, fontSize: 16, color: colors.fog, letterSpacing: 1, textAlign: 'center' },
  // Shown only when a queue failed to load — deliberately restrained, in the
  // same register as the rest of this screen rather than a shouting alert.
  retryBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.crimson,
    backgroundColor: 'transparent',
  },
  retryBtnText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.crimsonInk,
    fontWeight: '700',
  },

  // ── View Toggle ────────────────────────────────────────────────────────
  viewToggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: VIEW_GAP,
    marginTop: 16,
  },
  // 48 by its own box, as every control on the bench is; two to a row, a word each, and at the
  // largest text a tab takes a row of its own rather than cut its word.
  viewTab: {
    flexGrow: 1,
    flexBasis: '40%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingVertical: 10,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.ash,
    backgroundColor: 'transparent',
  },
  viewTabActive: {
    borderColor: colors.sepia,
    backgroundColor: 'rgba(184,137,26,0.08)',
  },
  viewTabText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.fog,
  },
  // The view on show, underlined as well as lit: the brighter ink and brass edge alone
  // do not say it to every eye.
  viewTabTextActive: {
    color: colors.parchment,
    textDecorationLine: 'underline',
  },

  // ── Multi-select Toolbar ───────────────────────────────────────────────
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: TOOLBAR_GAP,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.ash,
  },
  toolbarBtnActive: {
    borderColor: colors.sepia,
    backgroundColor: 'rgba(184,137,26,0.08)',
  },
  toolbarBtnText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.fog,
  },
  toolbarBtnTextActive: {
    color: colors.sepia,
  },
  bulkDismissBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.bloodReel,
  },
  bulkDismissBtnText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.parchment,
  },

  // ── Multi-select card state ────────────────────────────────────────────
  reportCardSelected: {
    borderColor: colors.sepia,
    backgroundColor: 'rgba(184,137,26,0.05)',
  },
  checkboxRow: {
    marginBottom: 12,
  },

  // ── Load More ──────────────────────────────────────────────────────────
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 24,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.sepia,
    backgroundColor: 'rgba(184,137,26,0.05)',
  },
  loadMoreText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
  },
});

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
