/**
 * DataVault — Import & Export Section
 * Pixel-exact match of web SettingsPage.tsx Section 4 (IMPORT & EXPORT)
 * - Import: file picker → progress bar → results grid
 * - Export: CSV via Share sheet
 * Zero competitor names.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Share, ScrollView,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Upload, Download, CheckCircle, AlertCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { importArchiveZip, ImportProgress, ImportResult } from '@/src/utils/archiveImport';

export default function DataVault() {
  const { logs, watchlist, vault, lists } = useFilmStore();
  const user = useAuthStore(s => s.user);

  // ── Import State ──
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── Export State ──
  const [exporting, setExporting] = useState(false);

  // ══════════════════════════════════════
  //  IMPORT HANDLER
  // ══════════════════════════════════════
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/zip',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (!file.uri) return;

      setImporting(true);
      setImportResult(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await importArchiveZip(file.uri, (progress) => {
        setImportProgress(progress);
      });

      setImportResult(res);

      // Refresh stores
      const filmStore = useFilmStore.getState();
      await Promise.all([
        filmStore.fetchLogs?.(),
        filmStore.fetchWatchlist?.(),
        filmStore.fetchLists?.(),
      ].filter(Boolean));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Import Failed', e.message || 'An error occurred during import.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // ══════════════════════════════════════
  //  EXPORT CSV HANDLER
  // ══════════════════════════════════════
  const handleExportCSV = async () => {
    if (!logs || logs.length === 0) {
      Alert.alert('No Data', 'No logs to export yet. Start logging films first.');
      return;
    }

    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const headers = ['Title', 'Year', 'Rating', 'Status', 'Date Watched', 'Review', 'Format'];
      const rows = logs.map((l: any) => [
        `"${(l.title || l.film_title || '').replace(/"/g, '""')}"`,
        l.year || '',
        l.rating || '',
        l.status || 'watched',
        l.watchedDate || l.watched_date || l.createdAt?.slice(0, 10) || '',
        `"${(l.review || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        l.format || 'Digital',
      ]);
      const csv = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');

      const username = user?.username || 'archive';
      const date = new Date().toISOString().slice(0, 10);
      const filePath = `${FileSystem.cacheDirectory}reelhouse_${username}_${date}.csv`;
      await FileSystem.writeAsStringAsync(filePath, csv, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export ReelHouse Archive',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        // Fallback to RN Share with text
        await Share.share({ message: csv, title: 'ReelHouse Data Archive' });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Export Failed', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setExporting(false);
    }
  };

  // ══════════════════════════════════════
  //  EXPORT JSON (full archive)
  // ══════════════════════════════════════
  const handleExportJSON = async () => {
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const dump = {
        meta: { exported_at: new Date().toISOString(), version: '1.0' },
        logs, watchlist, vault, lists,
      };
      const jsonStr = JSON.stringify(dump, null, 2);

      const username = user?.username || 'archive';
      const date = new Date().toISOString().slice(0, 10);
      const filePath = `${FileSystem.cacheDirectory}reelhouse_${username}_${date}.json`;
      await FileSystem.writeAsStringAsync(filePath, jsonStr, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Export ReelHouse Archive',
        });
      } else {
        await Share.share({ message: jsonStr, title: 'ReelHouse Data Archive' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Export Failed', err.message);
    } finally {
      setExporting(false);
    }
  };

  // ── Progress percentage ──
  const progressPct = importProgress && importProgress.total > 0
    ? (importProgress.current / importProgress.total) * 100 : 0;

  return (
    <Animated.View entering={FadeIn.duration(600)}>

      {/* ════════════════════════════════════
          IMPORT SECTION — matches web exactly
         ════════════════════════════════════ */}
      <View style={s.importSection}>
        <Text style={s.subLabel}>IMPORT YOUR DATA</Text>
        <Text style={s.importDesc}>
          Upload your exported film data archive (.zip) to transfer your complete viewing history, reviews, ratings, watchlist, and lists into The ReelHouse.
        </Text>

        {/* ── Upload Zone (idle state) ── */}
        {!importing && !importResult && (
          <TouchableOpacity style={s.uploadZone} onPress={handlePickFile} activeOpacity={0.7}>
            <Upload size={24} color={colors.sepia} style={{ opacity: 0.7, marginBottom: 10 }} />
            <Text style={s.uploadTitle}>Tap to select your archive ZIP</Text>
            <Text style={s.uploadHint}>or use the file browser</Text>
          </TouchableOpacity>
        )}

        {/* ── Progress Bar (importing state) ── */}
        {importing && importProgress && (
          <View style={s.progressCard}>
            <View style={s.progressHeader}>
              <Text style={s.progressPhase}>{importProgress.phase}</Text>
              <Text style={s.progressCount}>{importProgress.current} / {importProgress.total}</Text>
            </View>
            {/* Progress track */}
            <View style={s.progressTrack}>
              <View style={[s.progressBar, { width: `${progressPct}%` as any }]} />
            </View>
            {importProgress.detail && (
              <Text style={s.progressDetail}>{importProgress.detail}</Text>
            )}
          </View>
        )}

        {/* ── Import Result (complete state) ── */}
        {importResult && (
          <View style={s.resultCard}>
            <View style={s.resultHeader}>
              <CheckCircle size={16} color={colors.sepia} />
              <Text style={s.resultTitle}>TRANSFER COMPLETE</Text>
            </View>

            {/* Stats Grid — 2x2 */}
            <View style={s.statsGrid}>
              {[
                { label: 'FILM LOGS', value: importResult.logs },
                { label: 'REVIEWS', value: importResult.reviews },
                { label: 'WATCHLIST', value: importResult.watchlist },
                { label: 'STACKS', value: importResult.lists },
              ].map(stat => (
                <View key={stat.label} style={s.statCell}>
                  <Text style={s.statValue}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {importResult.skipped > 0 && (
              <View style={s.skippedRow}>
                <AlertCircle size={10} color={colors.fog} />
                <Text style={s.skippedText}>{importResult.skipped} films could not be matched</Text>
              </View>
            )}

            {importResult.errors.length > 0 && (
              <ScrollView style={s.errorScroll} nestedScrollEnabled>
                {importResult.errors.map((err, i) => (
                  <Text key={i} style={s.errorLine}>{'\u2022'} {err}</Text>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={s.importAnotherBtn}
              onPress={() => { setImportResult(null); handlePickFile(); }}
              activeOpacity={0.7}
            >
              <Upload size={12} color={colors.fog} />
              <Text style={s.importAnotherText}>IMPORT ANOTHER FILE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ════════════════════════════════════
          EXPORT SECTION — matches web exactly
         ════════════════════════════════════ */}
      <View style={s.divider} />

      <Text style={s.subLabel}>EXPORT YOUR DATA</Text>

      <TouchableOpacity style={s.actionBtn} onPress={handleExportCSV} disabled={exporting} activeOpacity={0.7}>
        <Download size={12} color={colors.fog} />
        <Text style={s.actionBtnText}>{exporting ? 'EXPORTING...' : 'EXPORT DATA (CSV)'}</Text>
      </TouchableOpacity>

      <View style={{ height: 8 }} />

      <TouchableOpacity style={s.actionBtn} onPress={handleExportJSON} disabled={exporting} activeOpacity={0.7}>
        <Download size={12} color={colors.fog} />
        <Text style={s.actionBtnText}>EXPORT FULL ARCHIVE (JSON)</Text>
      </TouchableOpacity>

    </Animated.View>
  );
}

const s = StyleSheet.create({
  // ── Import ──
  importSection: { marginBottom: 12 },
  subLabel: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5,
    color: colors.sepia, marginBottom: 10,
  },
  importDesc: {
    fontFamily: fonts.body, fontSize: 12, color: colors.fog,
    lineHeight: 19, marginBottom: 14, fontStyle: 'italic',
  },

  // ── Upload Zone ──
  uploadZone: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(139,105,20,0.25)',
    borderRadius: 6, paddingVertical: 24, paddingHorizontal: 20,
    alignItems: 'center', backgroundColor: 'rgba(10,7,3,0.4)',
  },
  uploadTitle: {
    fontFamily: fonts.display, fontSize: 14, color: colors.parchment, marginBottom: 4,
  },
  uploadHint: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.2, color: colors.fog,
  },

  // ── Progress ──
  progressCard: {
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 6,
    padding: 16, backgroundColor: 'rgba(10,7,3,0.6)',
  },
  progressHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  progressPhase: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1.5, color: colors.sepia,
  },
  progressCount: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog,
  },
  progressTrack: {
    width: '100%', height: 4, borderRadius: 2,
    backgroundColor: 'rgba(139,105,20,0.1)', overflow: 'hidden',
  },
  progressBar: {
    height: '100%', borderRadius: 2,
    backgroundColor: colors.sepia,
  },
  progressDetail: {
    fontFamily: fonts.body, fontSize: 11, color: colors.fog,
    marginTop: 8, fontStyle: 'italic', opacity: 0.7,
  },

  // ── Result Card ──
  resultCard: {
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', borderRadius: 6,
    padding: 16, backgroundColor: 'rgba(10,7,3,0.6)',
  },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  resultTitle: {
    fontFamily: fonts.display, fontSize: 14, color: colors.parchment,
  },

  // ── Stats Grid ──
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  statCell: {
    flex: 1, minWidth: '45%' as any,
    alignItems: 'center', paddingVertical: 10,
    backgroundColor: 'rgba(139,105,20,0.05)', borderRadius: 4,
  },
  statValue: {
    fontFamily: fonts.display, fontSize: 20, color: colors.parchment,
  },
  statLabel: {
    fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.5, color: colors.fog, marginTop: 2,
  },

  // ── Skipped / Errors ──
  skippedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 10,
  },
  skippedText: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.fog,
  },
  errorScroll: { maxHeight: 100, marginTop: 8 },
  errorLine: {
    fontFamily: fonts.body, fontSize: 10, color: 'rgba(162,36,36,0.8)',
    fontStyle: 'italic', marginBottom: 3,
  },

  // ── Import Another ──
  importAnotherBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.08)',
    borderRadius: 3, marginTop: 12,
  },
  importAnotherText: {
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.2, color: colors.fog,
  },

  // ── Export Action ──
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.08)',
    borderRadius: 3,
  },
  actionBtnText: {
    fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.2, color: colors.fog,
  },

  // ── Divider ──
  divider: {
    height: 1, marginVertical: 14,
    backgroundColor: 'rgba(139,105,20,0.15)',
  },
});
