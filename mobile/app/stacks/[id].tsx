import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Platform, FlatList, Alert, TextInput, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Edit3, Trash2, CheckCircle2, Award, MessageCircle, Send } from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';

const { width, height } = Dimensions.get('window');
const ITEM_WIDTH = (width - 32 - 16) / 3;
const ITEM_HEIGHT = ITEM_WIDTH * 1.5;
const HEADER_HEIGHT = height * 0.45;

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

export default function StackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { logs, toggleListEndorse, hasListEndorsed } = useFilmStore();

  const [list, setList] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [certifyCount, setCertifyCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showLoungeShare, setShowLoungeShare] = useState(false);
  const [lounges, setLounges] = useState<any[]>([]);
  const [sharingTo, setSharingTo] = useState<string | null>(null);

  // Scroll animations
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const headerStyle = useAnimatedStyle(() => {
    return {
      height: HEADER_HEIGHT,
      transform: [
        { translateY: interpolate(scrollY.value, [-100, 0, HEADER_HEIGHT], [0, 0, HEADER_HEIGHT * 0.5]) },
        { scale: interpolate(scrollY.value, [-100, 0], [1.2, 1], 'clamp') }
      ]
    };
  });

  const navBlurStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, [HEADER_HEIGHT * 0.5, HEADER_HEIGHT - 60], [0, 1], 'clamp')
    };
  });

  const fetchDetail = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('id, title, description, created_at, user_id, is_private')
        .eq('id', id)
        .single();

      if (error || !data) throw error;

      const [profileRes, itemsRes, endorseRes] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', data.user_id).single(),
        supabase.from('list_items').select('film_id, film_title, poster_path').eq('list_id', id),
        supabase.from('interactions').select('user_id', { count: 'exact', head: false }).eq('target_list_id', id).eq('type', 'endorse_list'),
      ]);

      setCertifyCount(endorseRes.count || endorseRes.data?.length || 0);

      setList({
        id: data.id,
        title: data.title,
        description: data.description,
        userId: data.user_id,
        user: profileRes.data?.username || 'anonymous',
        createdAt: data.created_at,
        films: (itemsRes.data || []).map((item: any) => ({
          id: item.film_id,
          title: item.film_title,
          poster_path: item.poster_path,
        })),
        isPrivate: data.is_private,
      });
    } catch (err) {
      console.error('List detail error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const isOwner = user?.id === list?.userId;
  const isCertified = hasListEndorsed(id);
  const loggedIds = new Set(logs.map(l => l.filmId));

  // ── CERTIFY ──
  const handleCertify = async () => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isCertified) {
      setCertifyCount(c => Math.max(0, c - 1));
    } else {
      setCertifyCount(c => c + 1);
      reelToast.success('Certified!');
    }
    await toggleListEndorse(id);
  };

  // ── COMMENTS ──
  const loadComments = async () => {
    const { data } = await supabase
      .from('list_comments')
      .select('id, user_id, content, created_at')
      .eq('list_id', id)
      .order('created_at', { ascending: true })
      .limit(30);
    if (!data || data.length === 0) { setComments([]); return; }
    const uids = [...new Set(data.map((c: any) => c.user_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', uids);
    const umap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.username]));
    setComments(data.map((c: any) => ({ ...c, username: umap[c.user_id] || 'anon' })));
  };

  const handleToggleComments = () => {
    Haptics.selectionAsync();
    const next = !showComments;
    setShowComments(next);
    if (next) loadComments();
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || submittingComment || !user) return;
    setSubmittingComment(true);
    try {
      const { error } = await supabase.from('list_comments').insert([{
        user_id: user.id, list_id: id, content: commentText.trim()
      }]);
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reelToast.success('Critique filed.');
      setCommentText('');
      loadComments();

      // Notify list owner
      const { data: listInfo } = await supabase.from('lists').select('user_id, title').eq('id', id).single();
      if (listInfo && String(listInfo.user_id) !== String(user.id)) {
        supabase.from('notifications').insert({
          user_id: listInfo.user_id,
          type: 'comment',
          from_username: user.username,
          message: `@${user.username} critiqued your stack "${listInfo.title || 'Untitled'}"`,
          read: false,
        });
      }
    } catch {
      reelToast.error('Failed to submit critique.');
    }
    setSubmittingComment(false);
  };

  // ── SHARE TO LOUNGE ──
  const handleOpenShareLounge = async () => {
    Haptics.selectionAsync();
    try {
      const { data } = await supabase
        .from('lounge_members')
        .select('lounge_id')
        .eq('user_id', user?.id);
      if (data && data.length > 0) {
        const loungeIds = data.map((r: any) => r.lounge_id);
        const { data: loungeData } = await supabase
          .from('lounges')
          .select('id, name, cover_image, is_private')
          .in('id', loungeIds);
        setLounges(loungeData || []);
      } else {
        setLounges([]);
      }
      setShowLoungeShare(true);
    } catch {
      setLounges([]);
      setShowLoungeShare(true);
    }
  };

  const handleShareToLounge = async (loungeId: string) => {
    if (sharingTo || !list) return;
    setSharingTo(loungeId);
    try {
      const caption = `${list.title} · ${list.films.length} films · by @${list.user}`;
      await supabase.from('lounge_messages').insert({
        lounge_id: loungeId,
        user_id: user?.id,
        username: user?.username || 'anon',
        content: caption,
        type: 'list_share',
        metadata: {
          listId: list.id,
          title: list.title,
          filmCount: list.films.length,
          curator: list.user,
          topPosters: list.films.slice(0, 4).map((f: any) => f.poster_path),
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reelToast.success('Shared to lounge!');
      setTimeout(() => setShowLoungeShare(false), 800);
    } catch {
      reelToast.error('Failed to share.');
    }
    setSharingTo(null);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Stack',
      'This will permanently remove this collection. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('list_items').delete().eq('list_id', id);
              await supabase.from('lists').delete().eq('id', id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            } catch {
              Alert.alert('Error', 'Failed to delete this stack.');
            }
          },
        },
      ]
    );
  };

  if (loading || !list) {
    return (
      <View style={s.container}>
        <View style={[s.navBar, { zIndex: 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={20} color={colors.bone} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.sepia} />
        </View>
      </View>
    );
  }

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isLogged = loggedIds.has(item.id);
    const posterUri = item.poster_path ? tmdb.poster(item.poster_path, 'w342') : null;

    return (
      <Animated.View entering={FadeInUp.duration(400).delay(Math.min(index * 30, 400))} style={s.filmItem}>
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/film/${item.id}`);
          }}
        >
          <View style={s.posterWrap}>
            {posterUri ? (
              <Image source={posterUri} style={s.poster} contentFit="cover" transition={300} placeholder={blurhash} />
            ) : (
              <View style={[s.poster, s.noPoster]} />
            )}
            <View style={s.indexBadge}>
              <Text style={s.indexText}>{index + 1}</Text>
            </View>
            {isLogged && (
              <BlurView intensity={40} tint="dark" style={s.loggedBadge}>
                <CheckCircle2 size={12} color={colors.sepia} strokeWidth={3} />
              </BlurView>
            )}
          </View>
          <Text style={s.filmTitle} numberOfLines={2}>{item.title}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const heroPoster = list.films.length > 0 && list.films[0].poster_path 
    ? tmdb.poster(list.films[0].poster_path, 'w780') 
    : null;

  return (
    <View style={s.container}>
      {/* Absolute Dynamic Nav Bar */}
      <View style={s.navBar}>
        <AnimatedBlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFill, navBlurStyle]} />
        <View style={s.navInner}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <ArrowLeft size={20} color={colors.bone} />
          </TouchableOpacity>
          {isOwner && (
            <View style={s.headerActions}>
              <TouchableOpacity style={s.actionBtn} onPress={() => router.push({ pathname: '/list-modal', params: { editId: id } } as any)}>
                <Edit3 size={18} color={colors.fog} />
              </TouchableOpacity>
              <TouchableOpacity style={s.actionBtn} onPress={handleDelete}>
                <Trash2 size={18} color="rgba(231,76,60,0.8)" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <AnimatedFlatList
        data={list.films}
        keyExtractor={(item: any) => String(item.id)}
        numColumns={3}
        contentContainerStyle={s.scrollContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Parallax Image Background */}
            <Animated.View style={[s.parallaxHeader, headerStyle]}>
              {heroPoster && (
                <Image source={heroPoster} style={StyleSheet.absoluteFillObject} contentFit="cover" blurRadius={20} />
              )}
              <LinearGradient 
                colors={['rgba(10, 7, 3, 0.4)', 'rgba(10, 7, 3, 0.9)', colors.ink]}
                locations={[0, 0.6, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            </Animated.View>

            {/* Content Overlaid on Header */}
            <View style={s.headerContentWrap}>
              <Animated.Text entering={FadeInDown.duration(600)} style={s.refCode}>
                VOL. {list.id.slice(0,4).toUpperCase()}
              </Animated.Text>
              <Animated.Text entering={FadeInDown.duration(600).delay(100)} style={s.title}>
                {list.title.toUpperCase()}
              </Animated.Text>
              
              <Animated.View entering={FadeInDown.duration(600).delay(200)} style={s.metaRow}>
                <View style={s.curatorDot} />
                <Text style={s.metaText}>@{list.user.toUpperCase()}  ·  {list.films.length} ENTRIES</Text>
              </Animated.View>
              
              {list.description && (
                <Animated.Text entering={FadeInDown.duration(600).delay(300)} style={s.desc}>
                  {list.description}
                </Animated.Text>
              )}

              {/* ── ACTION BAR: Certify · Critic · Share to Lounge ── */}
              <Animated.View entering={FadeInDown.duration(600).delay(350)} style={s.actionBar}>
                <TouchableOpacity style={s.actionItem} onPress={handleCertify} activeOpacity={0.7}>
                  <Award size={16} color={isCertified ? colors.sepia : colors.fog} fill={isCertified ? colors.sepia : 'none'} />
                  <Text style={[s.actionLabel, isCertified && { color: colors.sepia }]}>
                    {certifyCount > 0 ? `${certifyCount} ` : ''}{isCertified ? 'CERTIFIED' : 'CERTIFY'}
                  </Text>
                </TouchableOpacity>

                <View style={s.actionDivider} />

                <TouchableOpacity style={s.actionItem} onPress={handleToggleComments} activeOpacity={0.7}>
                  <MessageCircle size={14} color={showComments ? colors.sepia : colors.fog} />
                  <Text style={[s.actionLabel, showComments && { color: colors.sepia }]}>CRITIC</Text>
                </TouchableOpacity>

                <View style={s.actionDivider} />

                <TouchableOpacity style={s.actionItem} onPress={handleOpenShareLounge} activeOpacity={0.7}>
                  <Send size={14} color={colors.fog} />
                  <Text style={s.actionLabel}>LOUNGE</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* ── COMMENTS PANEL ── */}
              {showComments && (
                <View style={s.commentsPanel}>
                  {comments.length === 0 && (
                    <Text style={s.commentEmpty}>No remarks yet. Be the first to speak.</Text>
                  )}
                  {comments.map(c => (
                    <View key={c.id} style={s.commentRow}>
                      <Text style={s.commentUser}>@{c.username}</Text>
                      <Text style={s.commentBody}>{c.content}</Text>
                    </View>
                  ))}
                  {user && (
                    <View style={s.commentInputRow}>
                      <TextInput
                        style={s.commentInput}
                        placeholder="Leave a remark..."
                        placeholderTextColor={colors.ash}
                        value={commentText}
                        onChangeText={setCommentText}
                        returnKeyType="send"
                        onSubmitEditing={handleSubmitComment}
                      />
                      <TouchableOpacity onPress={handleSubmitComment} disabled={submittingComment || !commentText.trim()} style={[s.commentSendBtn, (!commentText.trim()) && { opacity: 0.3 }]}>
                        <Send size={14} color={colors.sepia} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              <View style={s.trackRow}>
                <Text style={s.trackLabel}>INDEXED REELS</Text>
                <View style={s.trackLine} />
              </View>
            </View>
          </>
        }
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={s.emptyTitle}>Archive Empty</Text>
            <Text style={s.emptySubtitle}>No films have been added to this collection.</Text>
          </View>
        }
      />

      {/* ── SHARE TO LOUNGE MODAL ── */}
      {showLoungeShare && (
        <View style={s.loungeOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowLoungeShare(false)} />
          <View style={s.loungeSheet}>
            <View style={s.loungeHeader}>
              <Send size={14} color={colors.sepia} />
              <Text style={s.loungeTitle}>SHARE TO LOUNGE</Text>
              <TouchableOpacity onPress={() => setShowLoungeShare(false)}>
                <Text style={s.loungeClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {lounges.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.fog }}>No lounges found. Join or create one first.</Text>
              </View>
            ) : (
              lounges.map(lounge => (
                <TouchableOpacity
                  key={lounge.id}
                  style={s.loungeRow}
                  activeOpacity={0.7}
                  onPress={() => handleShareToLounge(lounge.id)}
                  disabled={!!sharingTo}
                >
                  <View style={s.loungeAvatar}>
                    {lounge.cover_image ? (
                      <Image source={tmdb.poster(lounge.cover_image, 'w92')} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <MessageCircle size={12} color={colors.sepia} />
                    )}
                  </View>
                  <Text style={s.loungeName} numberOfLines={1}>{lounge.name}</Text>
                  <View style={s.loungeSendIcon}>
                    {sharingTo === lounge.id ? (
                      <ActivityIndicator size="small" color={colors.sepia} />
                    ) : (
                      <Send size={12} color={colors.sepia} />
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  navBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: Platform.OS === 'ios' ? 90 : 70, paddingTop: Platform.OS === 'ios' ? 44 : 20,
    zIndex: 100, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  navInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backBtn: { padding: 8, marginLeft: -8 },
  headerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 8 },

  scrollContent: { paddingBottom: 60 },
  parallaxHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: -1 },
  headerContentWrap: { marginTop: HEADER_HEIGHT - 120, paddingHorizontal: 16, paddingBottom: 24 },
  
  refCode: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 36, color: colors.parchment, lineHeight: 40, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 16 },
  curatorDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.sepia, marginRight: 8 },
  metaText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.fog },
  desc: { fontFamily: fonts.sub, fontSize: 14, color: colors.bone, lineHeight: 22, opacity: 0.9, marginBottom: 24 },
  
  // ── Action Bar ──
  actionBar: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.2)',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.2)',
    paddingVertical: 10, marginBottom: 16,
  },
  actionItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1, color: colors.fog },
  actionDivider: { width: 1, height: 16, backgroundColor: 'rgba(139,105,20,0.15)' },

  // ── Comments Panel ──
  commentsPanel: {
    backgroundColor: 'rgba(10,7,3,0.8)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 6, padding: 12, marginBottom: 16,
  },
  commentEmpty: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, textAlign: 'center', paddingVertical: 8, opacity: 0.7 },
  commentRow: { flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'baseline' },
  commentUser: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 0.5, color: colors.sepia, flexShrink: 0 },
  commentBody: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, lineHeight: 18, flex: 1 },
  commentInputRow: { flexDirection: 'row', gap: 8, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(139,105,20,0.1)', paddingTop: 8 },
  commentInput: { flex: 1, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8, fontFamily: fonts.body, fontSize: 12, color: colors.bone },
  commentSendBtn: { padding: 8, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', borderRadius: 4, justifyContent: 'center', alignItems: 'center' },

  // ── Share to Lounge Modal ──
  loungeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, backgroundColor: 'rgba(5,3,1,0.85)', justifyContent: 'flex-end' },
  loungeSheet: { backgroundColor: colors.ink, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.2)', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%', overflow: 'hidden' },
  loungeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.15)' },
  loungeTitle: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  loungeClose: { fontSize: 16, color: colors.fog, padding: 4 },
  loungeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,105,20,0.06)' },
  loungeAvatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(139,105,20,0.1)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  loungeName: { flex: 1, fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
  loungeSendIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', backgroundColor: 'rgba(139,105,20,0.08)', alignItems: 'center', justifyContent: 'center' },

  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 20 },
  trackLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  trackLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,105,20,0.2)' },
  
  filmItem: { width: ITEM_WIDTH, marginBottom: 24, marginHorizontal: 4 },
  posterWrap: { width: ITEM_WIDTH, height: ITEM_HEIGHT, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  poster: { width: '100%', height: '100%' },
  noPoster: { backgroundColor: colors.ash, opacity: 0.2 },
  indexBadge: { position: 'absolute', top: 0, left: 0, backgroundColor: colors.sepia, paddingHorizontal: 6, paddingVertical: 2, borderBottomRightRadius: 6 },
  indexText: { fontFamily: fonts.uiBold, fontSize: 9, color: colors.ink },
  loggedBadge: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(139,105,20,0.5)' },
  filmTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.fog, marginTop: 6, textAlign: 'center', paddingHorizontal: 2 },
  
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, marginBottom: 8 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center' },
});

