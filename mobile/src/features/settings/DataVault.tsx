/**
 * DataVault — Import & Export Section
 * Pixel-exact match of web SettingsPage.tsx Section 4 (IMPORT & EXPORT)
 * - Import: file picker → progress bar → results grid
 * - Export: CSV via Share sheet
 * Zero competitor names.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet,
  Share,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  Upload, Download, CheckCircle, AlertCircle,
} from 'lucide-react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import * as DocumentPicker from 'expo-document-picker';
import { documentDirectory, writeAsStringAsync, readAsStringAsync, EncodingType, deleteAsync, getInfoAsync } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useFilmStore , useWatchlistStore, useArchiveStore, useListStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { importArchiveZip, importArchiveJSON, ImportProgress, ImportResult } from '@/src/features/archive/archiveImport';
import { supabase } from '@/src/lib/supabase';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';

export default function DataVault() {
  const logs = useFilmStore(s => s.logs);
  const watchlist = useWatchlistStore(s => s.watchlist);
  const vault = useArchiveStore(s => s.physicalArchive);
  const lists = useListStore(s => s.lists);
  const user = useAuthStore(s => s.user);

  // ── Import State ──
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── Export State ──
  const [exporting, setExporting] = useState(false);

  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  // ══════════════════════════════════════
  //  IMPORT HANDLER
  // ══════════════════════════════════════
  const handlePickFile = async () => {
    if (importing || exporting) return;
    let fileUri: string | null = null;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (!file.uri) return;
      fileUri = file.uri;

      setImporting(true);
      setImportResult(null);
      setImportProgress({ phase: 'READING ARCHIVE', current: 0, total: 1 });
      TactileEngine.mutate();

      let lastUpdate = 0;
      const progressCb = (progress: ImportProgress) => {
        const now = Date.now();
        if (now - lastUpdate > 32 || progress.current === progress.total) { // ~30fps
          lastUpdate = now;
          if (isMounted.current) setImportProgress({ ...progress });
        }
      };

      let res: ImportResult;
      const isJson = file.name?.toLowerCase().endsWith('.json') || file.mimeType === 'application/json';
      if (isJson) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Yield to UI thread
        const info = await getInfoAsync(file.uri);
        if (info.exists && info.size > 25 * 1024 * 1024) throw new Error('File too large (max 25MB).');
        const rawText = await readAsStringAsync(file.uri, { encoding: EncodingType.UTF8 });
        let parsed;
        try { parsed = JSON.parse(rawText); } catch { throw new Error('Invalid JSON format.'); }
        const user = useAuthStore.getState().user;
        if (!user) throw new Error('User not found');
        res = await importArchiveJSON(parsed, user.id, progressCb);
      } else {
        res = await importArchiveZip(file.uri, progressCb);
      }

      if (!isMounted.current) return;
      setImportResult(res);

      // Refresh stores
      const filmStore = useFilmStore.getState();
      const archiveStore = useArchiveStore.getState();
      await Promise.all([
        filmStore.fetchLogs?.(),
        filmStore.fetchWatchlist?.(),
        filmStore.fetchLists?.(),
        archiveStore.fetchPhysicalArchive?.(),
      ].filter(Boolean));

      TactileEngine.success();
    } catch (e: unknown) {
      if (!isMounted.current) return;
      const msg = e instanceof Error ? e.message : 'An error occurred during import.';
      reelToast.error(msg);
      TactileEngine.error();
    } finally {
      if (isMounted.current) {
        setImporting(false);
        setImportProgress(null);
      }
      if (fileUri) {
        try { await deleteAsync(fileUri, { idempotent: true }); } catch (e) {}
      }
    }
  };

  // ══════════════════════════════════════
  //  EXPORT HELPERS
  // ══════════════════════════════════════
  const fetchAllRows = async (table: string, selectQuery: string = '*') => {
    if (!user) return [];
    let allData: any[] = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(selectQuery)
        .eq('user_id', user.id)
        .range(from, from + step - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allData = allData.concat(data);
      if (data.length < step) break;
      from += step;
    }
    return allData;
  };

  // ══════════════════════════════════════
  //  EXPORT CSV HANDLER
  // ══════════════════════════════════════
  const handleExportCSV = async () => {
    if (!user || importing || exporting) return;
    setExporting(true);
    TactileEngine.mutate();
    let filePath = '';

    try {
      const dbLogs = await fetchAllRows('logs');

      
      if (!isMounted.current) return;
      if (!dbLogs || dbLogs.length === 0) {
        reelToast.error('No logs to export yet. Start logging films first.');
        setExporting(false);
        return;
      }

      const headers = ['"Title"', '"Year"', '"Rating"', '"Status"', '"Date Watched"', '"Review"', '"Format"'];
      const rows = dbLogs.map((l: any) => [
        `"${String(l.film_title ?? '').replace(/"/g, '""')}"`,
        `"${String(l.year ?? '').replace(/"/g, '""')}"`,
        `"${String(l.rating ?? '').replace(/"/g, '""')}"`,
        `"${String(l.status ?? 'watched').replace(/"/g, '""')}"`,
        `"${String(l.watched_date ?? l.created_at?.slice(0, 10) ?? '').replace(/"/g, '""')}"`,
        `"${String(l.review ?? '').replace(/"/g, '""')}"`,
        `"${String(l.physical_media ?? 'Digital').replace(/"/g, '""')}"`,
      ]);
      const csv = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');

      const safeUsername = (user?.username ?? 'archive').replace(/[^a-zA-Z0-9_-]/g, '');
      const date = new Date().toISOString().slice(0, 10);
      const baseDir = documentDirectory ?? 'file:///';
      filePath = `${baseDir}reelhouse_${safeUsername}_${date}.csv`;
      await writeAsStringAsync(filePath, csv, { encoding: EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'text/csv',
          dialogTitle: 'Export ReelHouse Archive',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        reelToast.error('File sharing is unavailable on this device.');
      }

      if (isMounted.current) TactileEngine.success();
    } catch (err: unknown) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : 'Export failed';
      reelToast.error(msg);
      TactileEngine.error();
    } finally {
      if (isMounted.current) setExporting(false);
      if (filePath) { try { await deleteAsync(filePath, { idempotent: true }); } catch (e) {} }
    }
  };

  // ══════════════════════════════════════
  //  EXPORT JSON (full archive)
  // ══════════════════════════════════════
  const handleExportJSON = async () => {
    if (!user || importing || exporting) return;
    setExporting(true);
    TactileEngine.mutate();
    let filePath = '';

    try {
      const [dbLogs, dbWatchlist, dbVault, dbLists] = await Promise.all([
        fetchAllRows('logs'),
        fetchAllRows('watchlists'),
        fetchAllRows('physical_archive'),
        fetchAllRows('lists', '*, list_items(*)')
      ]);

      if (!isMounted.current) return;
      const hasData = (dbLogs?.length ?? 0) + (dbWatchlist?.length ?? 0) + (dbVault?.length ?? 0) + (dbLists?.length ?? 0) > 0;
      if (!hasData) {
        reelToast.error('No data to export yet. Start logging films first.');
        setExporting(false);
        return;
      }

      const dump = {
        meta: { exported_at: new Date().toISOString(), version: '2.0' },
        logs: dbLogs || [],
        watchlist: dbWatchlist || [],
        vault: dbVault || [],
        lists: (dbLists || []).map(list => ({
          ...list,
          films: list.list_items || []
        }))
      };
      await new Promise(resolve => setTimeout(resolve, 50)); // Yield to UI thread
      const jsonStr = JSON.stringify(dump); // Stripped whitespace for optimal memory usage

      const safeUsername = (user?.username ?? 'archive').replace(/[^a-zA-Z0-9_-]/g, '');
      const date = new Date().toISOString().slice(0, 10);
      const baseDir = documentDirectory ?? 'file:///';
      filePath = `${baseDir}reelhouse_${safeUsername}_${date}.json`;
      await writeAsStringAsync(filePath, jsonStr, { encoding: EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Export ReelHouse Archive',
        });
      } else {
        reelToast.error('File sharing is unavailable on this device.');
      }
      if (isMounted.current) TactileEngine.success();
    } catch (err: unknown) {
      if (!isMounted.current) return;
      const msg = err instanceof Error ? err.message : 'Export failed';
      reelToast.error(msg);
      TactileEngine.error();
    } finally {
      if (isMounted.current) setExporting(false);
      if (filePath) { try { await deleteAsync(filePath, { idempotent: true }); } catch (e) {} }
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
          Upload your exported film archive (.zip or .json) to transfer your complete viewing history, reviews, ratings, watchlist, and curated lists into The ReelHouse.
        </Text>

        {/* ── Upload Zone (idle state) ── */}
        {!importing && !importResult && (
          <PressableScale style={s.uploadZone} onPress={handlePickFile} haptic="medium" pressedScale={0.98} accessibilityLabel="Upload a file to import">
            <Upload size={24} color={colors.sepia} style={{ opacity: 0.7, marginBottom: 10 }} />
            <Text style={s.uploadTitle}>Tap to select your archive</Text>
            <Text style={s.uploadHint}>or use the file browser</Text>
          </PressableScale>
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
              <View style={[s.progressBar, { width: `${progressPct}%` as import('react-native').DimensionValue }]} />
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
              <View style={s.errorScroll}>
                {importResult.errors.map((err, i) => (
                  <Text key={i} style={s.errorLine}>{'\u2022'} {err}</Text>
                ))}
              </View>
            )}

            <PressableScale
              style={s.importAnotherBtn}
              onPress={handlePickFile}
              accessibilityLabel="Import another file"
              haptic="selection"
              pressedScale={0.97}
            >
              <Upload size={12} color={colors.fog} />
              <Text style={s.importAnotherText}>IMPORT ANOTHER FILE</Text>
            </PressableScale>
          </View>
        )}
      </View>

      {/* ════════════════════════════════════
          EXPORT SECTION — matches web exactly
         ════════════════════════════════════ */}
      <View style={s.divider} />

      <Text style={s.subLabel}>EXPORT YOUR DATA</Text>

      <PressableScale style={s.actionBtn} onPress={handleExportCSV} disabled={exporting} haptic="medium" pressedScale={0.97} accessibilityLabel="Export data as CSV">
        <Download size={12} color={colors.fog} />
        <Text style={s.actionBtnText}>{exporting ? 'EXPORTING...' : 'EXPORT DATA (CSV)'}</Text>
      </PressableScale>

      <View style={s.exportSpacer} />

      <PressableScale style={s.actionBtn} onPress={handleExportJSON} disabled={exporting} haptic="medium" pressedScale={0.97} accessibilityLabel="Export full archive as JSON">
        <Download size={12} color={colors.fog} />
        <Text style={s.actionBtnText}>{exporting ? 'EXPORTING...' : 'EXPORT FULL ARCHIVE (JSON)'}</Text>
      </PressableScale>

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
    flex: 1, minWidth: '45%',
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
  errorScroll: { marginTop: 8 },
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
  exportSpacer: { height: 8 },
});
