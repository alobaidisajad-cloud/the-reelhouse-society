import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import {
    AlertTriangle,
    ArrowLeft,
    Ban,
    Check,
    CheckSquare,
    Clock,
    FileSearch,
    Layers,
    List,
    Scale,
    Skull,
    Square,
    X,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp, SlideOutRight } from 'react-native-reanimated';

import PressableScale from '@/src/components/PressableScale';
import { ModerationService, PriorityCursor, ReportEvidence } from '@/src/services/ModerationService';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';
import { REPORT_REASON_LABELS, type ModAction, type ModActionRecord, type ReportReason } from '@/src/types/moderation';
import reelToast from '@/src/utils/reelToast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

type EnforcementAction = 'warn' | 'suspend' | 'ban' | 'permanent_exile';
type TribunalView = 'pending' | 'priority';

interface ActionModalState {
  visible: boolean;
  action: EnforcementAction | null;
  report: TribunalReport | null;
}

// ── Enforcement History Panel ──────────────────────────────────────────────

function EnforcementHistory({ userId }: { userId: string }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['admin', 'moderation-history', userId],
    queryFn: () => ModerationService.getUserModerationHistory(userId),
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <View style={s.historyContainer}>
        <Text style={s.historyLabel}>ENFORCEMENT RECORD</Text>
        <Text style={s.historyEmpty}>Loading...</Text>
      </View>
    );
  }

  if (history.length === 0) return null;

  return (
    <View style={s.historyContainer}>
      <Text style={s.historyLabel}>ENFORCEMENT RECORD</Text>
      {history.slice(0, 5).map((record: ModActionRecord) => (
        <View key={record.id} style={s.historyRow}>
          <View style={s.historyDot} />
          <View style={s.historyContent}>
            <Text style={s.historyAction}>
              {record.action.toUpperCase()}
            </Text>
            <Text style={s.historyReason} numberOfLines={1}>
              {record.reason}
            </Text>
            <Text style={s.historyDate}>
              {new Date(record.created_at).toLocaleDateString()}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
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
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const insets = useSafeAreaInsets();

  const reset = useCallback(() => {
    setReason('');
    setDurationHours('');
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleSubmit = useCallback(() => {
    if (!state.action || !reason.trim()) return;
    const hours = state.action === 'suspend' ? parseInt(durationHours, 10) : undefined;
    if (state.action === 'suspend' && (!hours || hours <= 0)) {
      reelToast.error('Duration must be a positive number of hours.');
      return;
    }
    onSubmit(state.action, reason.trim(), hours);
    reset();
  }, [state.action, reason, durationHours, onSubmit, reset]);

  const actionLabels: Record<EnforcementAction, { title: string; color: string; description: string }> = {
    warn: {
      title: 'ISSUE WARNING',
      color: colors.sepia,
      description: 'A formal warning will be recorded and the member notified.',
    },
    suspend: {
      title: 'SUSPEND MEMBER',
      color: colors.crimson,
      description: 'Temporarily restrict access for the specified duration.',
    },
    ban: {
      title: 'BAN MEMBER',
      color: colors.crimson,
      description: 'Permanently revoke access. This can be reversed by another admin.',
    },
    permanent_exile: {
      title: 'PERMANENT EXILE',
      color: colors.crimson,
      description: 'Irrevocable expulsion from the Society. Cannot be undone.',
    },
  };

  if (!state.action) return null;
  const config = actionLabels[state.action];

  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.modalHandle} />

          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, { color: config.color }]}>{config.title}</Text>
            <PressableScale onPress={handleClose} haptic="selection" pressedScale={0.9}>
              <X size={20} color={colors.fog} />
            </PressableScale>
          </View>

          <Text style={s.modalDescription}>{config.description}</Text>

          {state.action === 'suspend' && (
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>DURATION (HOURS)</Text>
              <TextInput
                style={s.textInput}
                value={durationHours}
                onChangeText={setDurationHours}
                keyboardType="numeric"
                placeholder="e.g. 24, 48, 72"
                placeholderTextColor={colors.fog}
                selectionColor={colors.selection}
                returnKeyType="next"
              />
            </View>
          )}

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>REASON</Text>
            <TextInput
              style={[s.textInput, s.textArea]}
              value={reason}
              onChangeText={setReason}
              placeholder="Describe the reason for this action..."
              placeholderTextColor={colors.fog}
              selectionColor={colors.selection}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={500}
            />
          </View>

          <PressableScale
            style={[s.submitBtn, { backgroundColor: config.color, opacity: reason.trim() ? 1 : 0.4 }]}
            onPress={handleSubmit}
            disabled={!reason.trim()}
            haptic="medium"
            pressedScale={0.97}
            accessibilityRole="button"
            accessibilityLabel={`Execute ${config.title}`}
          >
            <Text style={s.submitBtnText}>RENDER VERDICT</Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Tribunal Screen ───────────────────────────────────────────────────

export default function TribunalScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
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
  const [priorityCursor, setPriorityCursor] = useState<PriorityCursor | undefined>(undefined);
  const [priorityItems, setPriorityItems] = useState<TribunalReport[]>([]);
  const [hasMorePriority, setHasMorePriority] = useState(true);

  // ── Pending docket pagination state ────────────────────────────────────
  const [pendingItems, setPendingItems] = useState<TribunalReport[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);

  // ── Summoned evidence, per case ─────────────────────────────────────────
  const [evidence, setEvidence] = useState<Record<string, { loading: boolean; data?: ReportEvidence }>>({});

  const {
    data: pendingPage,
    isLoading,
    isRefetching: refreshing,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: () => ModerationService.getPendingReports(),
    enabled: user?.role === 'admin',
  });

  // First page (and every refetch after a verdict) resets the docket.
  React.useEffect(() => {
    if (pendingPage) {
      setPendingItems(pendingPage.rows as unknown as TribunalReport[]);
      setPendingTotal(pendingPage.total ?? pendingPage.rows.length);
    }
  }, [pendingPage]);

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
  } = useQuery({
    queryKey: ['admin', 'reports', 'priority'],
    queryFn: () => ModerationService.getPriorityQueue(20),
    enabled: user?.role === 'admin' && activeView === 'priority',
  });

  // Sync priority data to local state for cursor pagination accumulation
  React.useEffect(() => {
    if (priorityData && priorityData.length > 0 && !priorityCursor) {
      setPriorityItems(priorityData as unknown as TribunalReport[]);
      setHasMorePriority(priorityData.length >= 20);
    }
  }, [priorityData, priorityCursor]);

  // ── Load More for priority queue (compound keyset — matches RPC order) ──
  const loadMoreMutation = useMutation({
    mutationFn: (cursor: PriorityCursor) => ModerationService.getPriorityQueue(20, cursor),
    onSuccess: (data) => {
      const rows = data as unknown as TribunalReport[];
      if (rows.length > 0) {
        setPriorityItems((prev) => {
          const seen = new Set(prev.map(r => r.id));
          return [...prev, ...rows.filter(r => !seen.has(r.id))];
        });
        setHasMorePriority(rows.length >= 20);
        const last = rows[rows.length - 1];
        setPriorityCursor({
          report_count: Number(last.report_count ?? 1),
          created_at: last.created_at,
          id: last.id,
        });
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
    const last = priorityItems[priorityItems.length - 1];
    loadMoreMutation.mutate({
      report_count: Number(last.report_count ?? 1),
      created_at: last.created_at,
      id: last.id,
    });
  }, [priorityItems, loadMoreMutation]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'priority'] });
      TactileEngine.success();
      reelToast('Directive executed. Action recorded in the archives.');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'The Tribunal directive could not be executed.';
      reelToast.error(msg);
    },
  });

  // ── Bulk dismiss mutation ──────────────────────────────────────────────

  const bulkDismissMutation = useMutation({
    mutationFn: (reportIds: string[]) =>
      ModerationService.bulkDismiss(reportIds, user!.id, 'Bulk dismissed by Tribunal admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'reports', 'priority'] });
      TactileEngine.success();
      reelToast(`${selectedReports.size} report(s) dismissed.`);
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
    if (view === 'priority') {
      setPriorityCursor(undefined);
      setPriorityItems([]);
      setHasMorePriority(true);
    }
  }, []);

  const onRefresh = useCallback(() => {
    TactileEngine.navigate();
    if (activeView === 'pending') {
      refetch();
    } else {
      setPriorityCursor(undefined);
      setPriorityItems([]);
      setHasMorePriority(true);
      refetchPriority();
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
          ? 'This will permanently ban the member from the Society. Are you certain?'
          : 'PERMANENT EXILE is irrevocable. The member will be expelled forever. Proceed?';

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

  const handleDismiss = useCallback(
    (report: TribunalReport) => {
      TactileEngine.navigate();
      Alert.alert('Dismiss Report', 'Dismiss this report without action?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          onPress: () =>
            resolveV2Mutation.mutate({
              reportId: report.id,
              action: 'dismiss',
              reason: 'Dismissed by Tribunal admin',
            }),
        },
      ]);
    },
    [resolveV2Mutation],
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

  if (user?.role !== 'admin') return <View style={s.container} />;

  // ── Determine which data to show ──────────────────────────────────────

  const displayData: TribunalReport[] = activeView === 'pending' ? pendingItems : priorityItems;
  const isLoadingData = activeView === 'pending' ? isLoading : priorityLoading;
  const isRefreshingData = activeView === 'pending' ? refreshing : priorityRefreshing;
  const pendingRemaining = Math.max(pendingTotal - pendingItems.length, 0);

  return (
    <View style={s.container}>
      <LinearGradient
        colors={['rgba(180,45,45,0.10)', colors.ink]}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View entering={FadeInDown.duration(600)} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <PressableScale
          onPress={() => router.back()}
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
          {pendingTotal === 1 ? '1 matter awaits judgment' : `${pendingTotal} matters await judgment`}
        </Text>

        {/* ── View Toggle Tabs ─────────────────────────────────────────── */}
        <View style={s.viewToggleRow}>
          <PressableScale
            style={[s.viewTab, activeView === 'pending' && s.viewTabActive]}
            onPress={() => switchView('pending')}
            haptic="selection"
            pressedScale={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'pending' }}
            accessibilityLabel="Pending reports view"
          >
            <List size={14} color={activeView === 'pending' ? colors.parchment : colors.fog} />
            <Text style={[s.viewTabText, activeView === 'pending' && s.viewTabTextActive]}>
              THE DOCKET
            </Text>
          </PressableScale>

          <PressableScale
            style={[s.viewTab, activeView === 'priority' && s.viewTabActive]}
            onPress={() => switchView('priority')}
            haptic="selection"
            pressedScale={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeView === 'priority' }}
            accessibilityLabel="Priority queue view"
          >
            <Layers size={14} color={activeView === 'priority' ? colors.parchment : colors.fog} />
            <Text style={[s.viewTabText, activeView === 'priority' && s.viewTabTextActive]}>
              URGENT
            </Text>
          </PressableScale>
        </View>

        {/* ── Multi-select toolbar ────────────────────────────────────── */}
        {activeView === 'pending' && (
          <View style={s.toolbarRow}>
            <PressableScale
              style={[s.toolbarBtn, multiSelectMode && s.toolbarBtnActive]}
              onPress={toggleMultiSelect}
              haptic="selection"
              pressedScale={0.95}
              accessibilityRole="button"
              accessibilityLabel={multiSelectMode ? 'Exit multi-select mode' : 'Enter multi-select mode'}
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
              <PressableScale
                style={s.bulkDismissBtn}
                onPress={handleBulkDismiss}
                haptic="medium"
                pressedScale={0.95}
                disabled={bulkDismissMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Bulk dismiss ${selectedReports.size} reports`}
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
      </Animated.View>

      <ScrollView
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshingData} onRefresh={onRefresh} tintColor={colors.crimson} />
        }
      >
        {isLoadingData ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>Gathering the docket…</Text>
          </View>
        ) : displayData.length === 0 ? (
          <View style={s.emptyState}>
            <Scale size={48} color={colors.ash} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Text style={s.emptyText}>The docket is clear. The house rests.</Text>
          </View>
        ) : (
          <>
            {displayData.map((item, index) => {
              const reporterName = Array.isArray(item.reporter)
                ? (item.reporter[0] as any)?.username
                : item.reporter && typeof item.reporter === 'object' && 'username' in item.reporter
                  ? (item.reporter as any).username
                  : 'unknown';

              const accused = Array.isArray(item.target_user) ? item.target_user[0] : item.target_user;
              const warningCount = accused?.warning_count ?? 0;
              const isSelected = selectedReports.has(item.id);
              const ev = evidence[item.id];

              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInUp.duration(400).delay(Math.min(index * 50, 400))}
                  exiting={SlideOutRight}
                >
                  <PressableScale
                    style={[s.reportCard, isSelected && s.reportCardSelected]}
                    onPress={multiSelectMode ? () => toggleReportSelection(item.id) : undefined}
                    disabled={!multiSelectMode}
                    pressedScale={multiSelectMode ? 0.98 : 1}
                    accessibilityRole={multiSelectMode ? 'checkbox' : undefined}
                    accessibilityState={multiSelectMode ? { checked: isSelected } : undefined}
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

                    <View style={s.cardHeader}>
                      <Text style={s.reportMeta}>
                        CASE FILED {new Date(item.created_at).toLocaleDateString()}
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
                        onPress={() => (router.push as any)(`/user/${accused.username}`)}
                        haptic="selection"
                        pressedScale={0.98}
                        accessibilityRole="button"
                        accessibilityLabel={`View the accused, ${accused.username}`}
                      >
                        <View style={s.accusedAvatar}>
                          {accused.avatar_url
                            ? <Image source={{ uri: accused.avatar_url }} style={s.accusedAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
                            : <Text style={s.accusedAvatarLetter}>{accused.username[0]?.toUpperCase()}</Text>}
                        </View>
                        <View style={s.accusedInfo}>
                          <Text style={s.accusedLabel}>THE ACCUSED</Text>
                          <Text style={s.accusedName} numberOfLines={1}>@{accused.username}</Text>
                        </View>
                        <WarningBadge count={warningCount} />
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
                            {!!ev.data.title && <Text style={s.evidenceTitle} numberOfLines={2}>{ev.data.title}</Text>}
                            <Text style={s.contextValue} selectable>“{ev.data.body}”</Text>
                            {!!ev.data.route && (
                              <PressableScale
                                onPress={() => (router.push as any)(ev.data!.route!)}
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
                          <Text style={s.evidenceDestroyed}>The evidence has been destroyed — the page no longer exists.</Text>
                        )
                      ) : (
                        <PressableScale
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
                    {!!item.target_user_id && <EnforcementHistory userId={item.target_user_id} />}

                    {/* Action Row — hidden in multi-select mode */}
                    {!multiSelectMode && (
                      <View style={s.actionGrid}>
                        <View style={s.actionRow}>
                          <PressableScale
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
                            <PressableScale
                              style={[s.actionBtn, { borderColor: colors.sepia, backgroundColor: 'rgba(184,137,26,0.08)' }]}
                              onPress={() => openActionModal('warn', item)}
                              haptic="selection"
                              pressedScale={0.95}
                              accessibilityRole="button"
                              accessibilityLabel="Issue warning"
                            >
                              <AlertTriangle size={14} color={colors.sepia} />
                              <Text style={[s.actionText, { color: colors.sepia }]}>WARN</Text>
                            </PressableScale>
                          )}
                        </View>

                        {!!item.target_user_id && (
                          <>
                            <View style={s.actionRow}>
                              <PressableScale
                                style={[s.actionBtn, { borderColor: colors.crimson, backgroundColor: 'rgba(180,45,45,0.08)' }]}
                                onPress={() => openActionModal('suspend', item)}
                                haptic="medium"
                                pressedScale={0.95}
                                accessibilityRole="button"
                                accessibilityLabel="Suspend member"
                              >
                                <Clock size={14} color={colors.crimson} />
                                <Text style={[s.actionText, { color: colors.crimson }]}>SUSPEND</Text>
                              </PressableScale>

                              <PressableScale
                                style={[s.actionBtn, { borderColor: colors.bloodReel, backgroundColor: 'rgba(107,26,10,0.12)' }]}
                                onPress={() => handleBanOrExile('ban', item)}
                                haptic="medium"
                                pressedScale={0.95}
                                accessibilityRole="button"
                                accessibilityLabel="Ban member"
                              >
                                <Ban size={14} color={colors.crimson} />
                                <Text style={[s.actionText, { color: colors.crimson }]}>BAN</Text>
                              </PressableScale>
                            </View>

                            <PressableScale
                              style={[s.actionBtn, s.exileBtn]}
                              onPress={() => handleBanOrExile('permanent_exile', item)}
                              haptic="heavy"
                              pressedScale={0.95}
                              accessibilityRole="button"
                              accessibilityLabel="Permanently exile member"
                            >
                              <Skull size={14} color={colors.crimson} />
                              <Text style={[s.actionText, { color: colors.crimson }]}>PERMANENT EXILE</Text>
                            </PressableScale>
                          </>
                        )}
                      </View>
                    )}
                  </PressableScale>
                </Animated.View>
              );
            })}

            {/* ── Load More (pending docket — exact remainder) ──────────── */}
            {activeView === 'pending' && pendingRemaining > 0 && (
              <PressableScale
                style={s.loadMoreBtn}
                onPress={handleLoadMorePending}
                haptic="selection"
                pressedScale={0.97}
                disabled={loadMorePendingMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Load ${pendingRemaining} earlier cases`}
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
    color: colors.crimson,
    marginBottom: 6,
  },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, marginBottom: 4 },
  subtitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.fog },

  listContent: { padding: 16, paddingBottom: 60 },
  reportCard: {
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
  reportMeta: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: {
    backgroundColor: 'rgba(180,45,45,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(180,45,45,0.35)',
  },
  typeBadgeText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.crimson },

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
  accusedLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog },
  accusedName: { fontFamily: fonts.sub, fontSize: 13, color: colors.sepia, marginTop: 1 },
  accusedUnknown: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog, marginTop: 2 },

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
    fontSize: 9,
    letterSpacing: 2,
    color: colors.ash,
    marginBottom: 4,
  },
  contextValue: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 19 },
  evidenceTitle: { fontFamily: fonts.sub, fontSize: 12, color: colors.parchment, marginBottom: 4 },
  evidenceOpen: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginTop: 8 },
  evidenceDestroyed: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog },
  summonBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.4)', borderStyle: 'dashed',
    borderRadius: 3, paddingVertical: 10,
  },
  summonText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia },

  // ── Action Grid ────────────────────────────────────────────────────────
  actionGrid: { gap: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
    fontSize: 8,
    letterSpacing: 1,
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
    fontSize: 8,
    letterSpacing: 1,
    color: colors.crimson,
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
    fontSize: 9,
    letterSpacing: 2,
    color: colors.fog,
    marginBottom: 8,
  },
  historyEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.fog },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  historyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.sepia,
    marginTop: 4,
  },
  historyContent: { flex: 1 },
  historyAction: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.bone,
  },
  historyReason: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, marginTop: 2 },
  historyDate: { fontFamily: fonts.sub, fontSize: 9, color: colors.ash, marginTop: 2 },

  // ── Modal ──────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    fontSize: 9,
    letterSpacing: 2,
    color: colors.fog,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: colors.soot,
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
  emptyText: { fontFamily: fonts.sub, fontSize: 16, color: colors.fog, letterSpacing: 1 },

  // ── View Toggle ────────────────────────────────────────────────────────
  viewToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  viewTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
  viewTabTextActive: {
    color: colors.parchment,
  },

  // ── Multi-select Toolbar ───────────────────────────────────────────────
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontSize: 9,
    letterSpacing: 2,
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
    fontSize: 9,
    letterSpacing: 2,
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
