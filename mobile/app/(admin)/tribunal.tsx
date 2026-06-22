import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import {
    AlertTriangle,
    ArrowLeft,
    Ban,
    Check,
    CheckSquare,
    Clock,
    Layers,
    List,
    ShieldAlert,
    Skull,
    Square,
    X,
} from 'lucide-react-native';
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
import { ModerationService } from '@/src/services/ModerationService';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, radii, spacing } from '@/src/theme/theme';
import type { ModAction, ModActionRecord } from '@/src/types/moderation';
import reelToast from '@/src/utils/reelToast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  target_user?: { id: string; username: string; warning_count?: number } | { id: string; username: string; warning_count?: number }[];
  report_count?: number;
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
      <AlertTriangle size={10} color={colors.parchment} />
      <Text style={s.warningBadgeText}>{count}</Text>
    </View>
  );
}

// ── Report Count Badge ─────────────────────────────────────────────────────

function ReportCountBadge({ count }: { count?: number }) {
  if (!count || count <= 1) return null;
  return (
    <View style={s.reportCountBadge}>
      <Layers size={10} color={colors.parchment} />
      <Text style={s.reportCountBadgeText}>{count}</Text>
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
      color: colors.danger,
      description: 'Temporarily restrict access for the specified duration.',
    },
    ban: {
      title: 'BAN MEMBER',
      color: colors.bloodReel,
      description: 'Permanently revoke access. This can be reversed by another admin.',
    },
    permanent_exile: {
      title: 'PERMANENT EXILE',
      color: colors.bloodReel,
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
            <Text style={s.submitBtnText}>EXECUTE DIRECTIVE</Text>
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
  const [priorityCursor, setPriorityCursor] = useState<string | undefined>(undefined);
  const [priorityItems, setPriorityItems] = useState<TribunalReport[]>([]);
  const [hasMorePriority, setHasMorePriority] = useState(true);

  const {
    data: reports = [],
    isLoading,
    isRefetching: refreshing,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'reports', 'pending'],
    queryFn: ModerationService.getPendingReports,
    enabled: (user as any)?.role === 'admin',
  });

  // ── Priority Queue query ───────────────────────────────────────────────
  const {
    data: priorityData,
    isLoading: priorityLoading,
    isRefetching: priorityRefreshing,
    refetch: refetchPriority,
  } = useQuery({
    queryKey: ['admin', 'reports', 'priority'],
    queryFn: () => ModerationService.getPriorityQueue(20),
    enabled: (user as any)?.role === 'admin' && activeView === 'priority',
  });

  // Sync priority data to local state for cursor pagination accumulation
  React.useEffect(() => {
    if (priorityData && priorityData.length > 0 && !priorityCursor) {
      setPriorityItems(priorityData);
      setHasMorePriority(priorityData.length >= 20);
    }
  }, [priorityData, priorityCursor]);

  // ── Load More for priority queue ───────────────────────────────────────
  const loadMoreMutation = useMutation({
    mutationFn: (cursor: string) => ModerationService.getPriorityQueue(20, cursor),
    onSuccess: (data) => {
      if (data && data.length > 0) {
        setPriorityItems((prev) => [...prev, ...data]);
        setHasMorePriority(data.length >= 20);
        setPriorityCursor(data[data.length - 1].id);
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
    const lastItem = priorityItems[priorityItems.length - 1];
    loadMoreMutation.mutate(lastItem.id);
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

  if ((user as any)?.role !== 'admin') return <View style={s.container} />;

  // ── Determine which data to show ──────────────────────────────────────

  const displayData: TribunalReport[] = (activeView === 'pending' ? reports : priorityItems) as TribunalReport[];
  const isLoadingData = activeView === 'pending' ? isLoading : priorityLoading;
  const isRefreshingData = activeView === 'pending' ? refreshing : priorityRefreshing;

  return (
    <View style={s.container}>
      <LinearGradient
        colors={['rgba(231,76,60,0.1)', colors.ink]}
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
        <ShieldAlert size={28} color={colors.danger} style={{ marginBottom: 16 }} />
        <Text style={s.eyebrow}>ADMINISTRATION</Text>
        <Text style={s.title}>The Tribunal</Text>
        <Text style={s.subtitle}>{reports.length} pending infractions</Text>

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
              PENDING
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
              PRIORITY
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
          <RefreshControl refreshing={isRefreshingData} onRefresh={onRefresh} tintColor={colors.danger} />
        }
      >
        {isLoadingData ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>Loading records...</Text>
          </View>
        ) : displayData.length === 0 ? (
          <View style={s.emptyState}>
            <ShieldAlert size={48} color={colors.ash} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Text style={s.emptyText}>The archives are secure.</Text>
          </View>
        ) : (
          <>
            {displayData.map((item, index) => {
              const reporterName = Array.isArray(item.reporter)
                ? (item.reporter[0] as any)?.username
                : item.reporter && typeof item.reporter === 'object' && 'username' in item.reporter
                  ? (item.reporter as any).username
                  : 'unknown';

              const targetUserId = item.target_user_id || item.content_id;
              const warningCount = (item.target_user as any)?.warning_count ?? 0;
              const isSelected = selectedReports.has(item.id);

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
                        REPORTED {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                      <View style={s.badgeRow}>
                        <ReportCountBadge count={item.report_count} />
                        <WarningBadge count={warningCount} />
                        <View style={s.typeBadge}>
                          <Text style={s.typeBadgeText}>{item.content_type.toUpperCase()}</Text>
                        </View>
                      </View>
                    </View>

                    <Text style={s.reasonTitle}>{item.reason}</Text>

                    <View style={s.detailsBox}>
                      <Text style={s.contextLabel}>TARGET IDENTIFIER</Text>
                      <Text style={s.contextValue} selectable>
                        {item.content_id}
                      </Text>

                      {item.details && (
                        <>
                          <Text style={[s.contextLabel, { marginTop: 12 }]}>INCIDENT DETAILS</Text>
                          <Text style={s.contextValue}>{item.details}</Text>
                        </>
                      )}

                      <Text style={[s.contextLabel, { marginTop: 12 }]}>REPORTED BY</Text>
                      <Text style={s.contextValue}>@{reporterName}</Text>
                    </View>

                    {/* Enforcement History */}
                    <EnforcementHistory userId={targetUserId} />

                    {/* Action Row — hidden in multi-select mode */}
                    {!multiSelectMode && (
                      <View style={s.actionGrid}>
                        <View style={s.actionRow}>
                          <PressableScale
                            style={[s.actionBtn, { borderColor: colors.ash }]}
                            onPress={() => handleDismiss(item)}
                            haptic="selection"
                            pressedScale={0.95}
                            accessibilityRole="button"
                            accessibilityLabel="Dismiss report"
                          >
                            <Check size={14} color={colors.fog} />
                            <Text style={[s.actionText, { color: colors.fog }]}>DISMISS</Text>
                          </PressableScale>

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
                        </View>

                        <View style={s.actionRow}>
                          <PressableScale
                            style={[s.actionBtn, { borderColor: colors.danger, backgroundColor: 'rgba(231,76,60,0.08)' }]}
                            onPress={() => openActionModal('suspend', item)}
                            haptic="medium"
                            pressedScale={0.95}
                            accessibilityRole="button"
                            accessibilityLabel="Suspend member"
                          >
                            <Clock size={14} color={colors.danger} />
                            <Text style={[s.actionText, { color: colors.danger }]}>SUSPEND</Text>
                          </PressableScale>

                          <PressableScale
                            style={[s.actionBtn, { borderColor: colors.bloodReel, backgroundColor: 'rgba(107,26,10,0.12)' }]}
                            onPress={() => handleBanOrExile('ban', item)}
                            haptic="medium"
                            pressedScale={0.95}
                            accessibilityRole="button"
                            accessibilityLabel="Ban member"
                          >
                            <Ban size={14} color={colors.bloodReel} />
                            <Text style={[s.actionText, { color: colors.bloodReel }]}>BAN</Text>
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
                          <Skull size={14} color={colors.bloodReel} />
                          <Text style={[s.actionText, { color: colors.bloodReel }]}>PERMANENT EXILE</Text>
                        </PressableScale>
                      </View>
                    )}
                  </PressableScale>
                </Animated.View>
              );
            })}

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
                  <Text style={s.loadMoreText}>LOAD MORE</Text>
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
    borderBottomColor: 'rgba(231,76,60,0.2)',
  },
  backBtn: { alignSelf: 'flex-start', padding: 8, marginLeft: -8, marginBottom: 16 },
  eyebrow: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 4,
    color: colors.danger,
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
  reportMeta: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.3)',
  },
  typeBadgeText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 2, color: colors.danger },

  reasonTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 16 },

  detailsBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 16,
  },
  contextLabel: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.ash,
    marginBottom: 4,
  },
  contextValue: { fontFamily: fonts.body, fontSize: 13, color: colors.bone },

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
  actionText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2 },
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
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.sepia,
  },

  // ── Report Count Badge ─────────────────────────────────────────────────
  reportCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(231,76,60,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  reportCountBadgeText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.danger,
  },

  // ── Enforcement History ────────────────────────────────────────────────
  historyContainer: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.ash,
  },
  historyLabel: {
    fontFamily: fonts.uiBold,
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
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.bone,
  },
  historyReason: { fontFamily: fonts.body, fontSize: 11, color: colors.fog, marginTop: 2 },
  historyDate: { fontFamily: fonts.ui, fontSize: 9, color: colors.ash, marginTop: 2 },

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
    fontFamily: fonts.uiBold,
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
    fontFamily: fonts.uiBold,
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
    fontFamily: fonts.uiBold,
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
    fontFamily: fonts.uiBold,
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
    fontFamily: fonts.uiBold,
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
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 3,
    color: colors.sepia,
  },
});
