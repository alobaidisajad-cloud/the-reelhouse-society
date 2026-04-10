import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp, SlideOutRight } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ShieldAlert, Trash2, Check, ArrowLeft, Ban } from 'lucide-react-native';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { LinearGradient } from 'expo-linear-gradient';

const ADMIN_ID = 'd1c40ed8-10bc-4a6e-b51a-b6d3559bf755';

export default function TribunalScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user && user.id !== ADMIN_ID) {
      router.replace('/(tabs)/profile');
    }
  }, [user, router]);

  const fetchReports = useCallback(async () => {
    if (user?.id !== ADMIN_ID) return;
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          id, content_type, content_id, reason, details, status, created_at,
          reporter:profiles!reporter_id(id, username)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fetchReports();
  }, [fetchReports]);

  const handleResolve = async (id: string, action: 'dismiss' | 'delete' | 'ban_user', report: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Confirm Action',
      `Are you sure you want to ${action.toUpperCase()} this report on ${report.content_type}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Execute', 
          style: action !== 'dismiss' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              // Perform action
              if (action === 'delete') {
                switch(report.content_type) {
                  case 'review':
                    await supabase.from('reviews').delete().eq('id', report.content_id);
                    break;
                  case 'list':
                    await supabase.from('lists').delete().eq('id', report.content_id);
                    break;
                  case 'film':
                    // Just removing from local log mapping if necessary, or purging log
                    break;
                  case 'dispatch':
                    await supabase.from('dispatches').delete().eq('id', report.content_id);
                    break;
                }
              }

              if (action === 'ban_user' && report.content_type === 'user') {
                // Delete user's profile and reset them (Edge function required for full auth deletion, we just flag them here natively via role)
                await supabase.from('profiles').update({ role: 'banned' }).eq('id', report.content_id);
              }

              // Update report status
              await supabase.from('reports').update({ status: 'resolved', notes: `Resolved by Tribunal via ${action}` }).eq('id', id);
              
              setReports(prev => prev.filter(r => r.id !== id));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err: any) {
              Alert.alert('Action Failed', err.message);
            }
          }
        }
      ]
    );
  };

  if (user?.id !== ADMIN_ID) return <View style={s.container} />;

  return (
    <View style={s.container}>
      <LinearGradient 
        colors={['rgba(231,76,60,0.1)', colors.ink]} 
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View entering={FadeInDown.duration(600)} style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color={colors.bone} />
        </TouchableOpacity>
        <ShieldAlert size={28} color={colors.danger} style={{ marginBottom: 16 }} />
        <Text style={s.eyebrow}>ADMINISTRATION</Text>
        <Text style={s.title}>The Tribunal</Text>
        <Text style={s.subtitle}>{reports.length} pending infractions</Text>
      </Animated.View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.danger} />}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInUp.duration(400).delay(index * 50)} exiting={SlideOutRight}>
            <View style={s.reportCard}>
              <View style={s.cardHeader}>
                <Text style={s.reportMeta}>REPORTED EXACTLY {new Date(item.created_at).toLocaleDateString()}</Text>
                <View style={s.typeBadge}><Text style={s.typeBadgeText}>{item.content_type.toUpperCase()}</Text></View>
              </View>
              
              <Text style={s.reasonTitle}>{item.reason}</Text>
              
              <View style={s.detailsBox}>
                <Text style={s.contextLabel}>TARGET IDENTIFIER</Text>
                <Text style={s.contextValue} selectable>{item.content_id}</Text>
                
                {item.details && (
                  <>
                    <Text style={[s.contextLabel, { marginTop: 12 }]}>INCIDENT DETAILS</Text>
                    <Text style={s.contextValue}>{item.details}</Text>
                  </>
                )}
                
                <Text style={[s.contextLabel, { marginTop: 12 }]}>REPORTED BY</Text>
                <Text style={s.contextValue}>@{item.reporter?.username || 'unknown'}</Text>
              </View>

              <View style={s.actionRow}>
                <TouchableOpacity 
                  style={[s.actionBtn, { borderColor: colors.ash }]} 
                  onPress={() => handleResolve(item.id, 'dismiss', item)}
                >
                  <Check size={14} color={colors.fog} />
                  <Text style={[s.actionText, { color: colors.fog }]}>DISMISS</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[s.actionBtn, { borderColor: colors.danger, backgroundColor: 'rgba(231,76,60,0.1)' }]} 
                  onPress={() => handleResolve(item.id, item.content_type === 'user' ? 'ban_user' : 'delete', item)}
                >
                  {item.content_type === 'user' ? <Ban size={14} color={colors.danger} /> : <Trash2 size={14} color={colors.danger} />}
                  <Text style={[s.actionText, { color: colors.danger }]}>{item.content_type === 'user' ? 'BAN USER' : 'DESTROY TARGET'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={s.emptyState}>
              <ShieldAlert size={48} color={colors.ash} style={{ opacity: 0.5, marginBottom: 16 }} />
              <Text style={s.emptyText}>The archives are secure.</Text>
            </View>
          ) : null}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  header: { 
    paddingTop: Platform.OS === 'ios' ? 60 : 30, 
    paddingHorizontal: 20, paddingBottom: 20, 
    borderBottomWidth: 1, borderBottomColor: 'rgba(231,76,60,0.2)' 
  },
  backBtn: { alignSelf: 'flex-start', padding: 8, marginLeft: -8, marginBottom: 16 },
  eyebrow: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 4, color: colors.danger, marginBottom: 6 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, marginBottom: 4 },
  subtitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.fog },
  
  listContent: { padding: 16, paddingBottom: 60 },
  reportCard: { 
    backgroundColor: colors.soot, borderRadius: 2, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.ash,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  reportMeta: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5, color: colors.fog },
  typeBadge: { backgroundColor: 'rgba(231,76,60,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(231,76,60,0.3)' },
  typeBadgeText: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 2, color: colors.danger },
  
  reasonTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 16 },
  
  detailsBox: { backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 20 },
  contextLabel: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 2, color: colors.ash, marginBottom: 4 },
  contextValue: { fontFamily: fonts.body, fontSize: 13, color: colors.bone },
  
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 2, borderWidth: 1 },
  actionText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2 },
  
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: fonts.sub, fontSize: 16, color: colors.fog, letterSpacing: 1 },
});
