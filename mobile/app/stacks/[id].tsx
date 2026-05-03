import React, { useEffect, useState, useCallback } from 'react';
 
import { View, Text, StyleSheet, ActivityIndicator, Alert, TextInput, Pressable, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, useAnimatedKeyboard } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Edit3, Trash2, CheckCircle2, Award, MessageCircle, Send } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';


const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);


interface FilmItem {
  id: number;
  title: string;
  poster_path: string | null;
}

interface ListDetail {
  id: string;
  title: string;
  description: string;
  userId: string;
  user: string;
  createdAt: string;
  films: FilmItem[];
  isPrivate: boolean;
  isRanked: boolean;
}

interface ListComment {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

interface LoungeItem {
  id: string;
  name: string;
  cover_image: string | null;
  is_private: boolean;
}

// ── Memoized Comment Row ──
 
const StackCommentRow = React.memo(({ c }: { c: ListComment }) => (
  <View style={s.commentRow}>
    <Text style={s.commentUser} numberOfLines={1}>@{c.username}</Text>
    <Text style={s.commentBody}>{c.content}</Text>
  </View>
));

 
const StackDetailFilmCard = React.memo(({ 
  item, 
  index, 
  isLogged, 
  isRanked, 
  onPress,
  itemWidth,
  itemHeight,
}: { 
  item: FilmItem; 
  index: number; 
  isLogged: boolean; 
  isRanked: boolean; 
  onPress: (id: number) => void;
  itemWidth: number;
  itemHeight: number;
}) => {
  return (
    <Animated.View entering={FadeInUp.duration(400).delay(Math.min(index * 30, 400))} style={[s.filmItem, { width: itemWidth }]}>
      <PressableScale 
        style={[s.filmCard, { width: itemWidth, height: itemHeight }]} 
        onPress={() => onPress(item.id)}
      >
        {item.poster_path ? (
          <Image 
            source={{ uri: tmdb.poster(item.poster_path, 'w342')! }} 
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            cachePolicy="memory-disk"
            placeholder={{ blurhash }}
            transition={200}
          />
        ) : (
          <View style={s.posterPlaceholder}>
            <Text style={s.placeholderText} numberOfLines={3} adjustsFontSizeToFit>{item.title}</Text>
          </View>
        )}
        {isLogged && (
          <View style={s.loggedBadge}>
            <CheckCircle2 size={12} color={colors.parchment} />
          </View>
        )}
        {isRanked && (
          <View style={s.rankBadgeWrap}>
            <LinearGradient 
              colors={['transparent', 'rgba(10,7,3,0.8)', 'rgba(5,4,2,0.95)']} 
              style={StyleSheet.absoluteFillObject} 
            />
            <Text style={s.rankNumber}>{index + 1}</Text>
          </View>
        )}
      </PressableScale>
      <Text style={s.filmTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{item.title}</Text>
    </Animated.View>
  );
});

export default function StackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  
  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value,
  }));
  const { logs, toggleListEndorse, hasListEndorsed, deleteList } = useFilmStore();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const ITEM_WIDTH = (windowWidth - 32 - 16) / 3;
  const ITEM_HEIGHT = ITEM_WIDTH * 1.5;
  const HEADER_HEIGHT = windowHeight * 0.45;

  // ── React Query: MMKV-cached stack detail (instant revisits) ──
  const { data: stackQueryData, isLoading: stackQueryLoading } = useQuery({
    queryKey: ['stack', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('id, title, description, created_at, user_id, is_private, is_ranked')
        .eq('id', id)
        .single();

      if (error || !data) throw error;

      const [profileRes, itemsRes, endorseRes] = await Promise.all([
        supabase.from('profiles').select('username').eq('id', data.user_id).single(),
        supabase.from('list_items').select('film_id, film_title, poster_path').eq('list_id', id).order('position', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from('interactions').select('user_id', { count: 'exact', head: false }).eq('target_list_id', id).eq('type', 'endorse_list'),
      ]);

      const endorseCount = endorseRes.count || endorseRes.data?.length || 0;

      const listDetail: ListDetail = {
        id: data.id,
        title: data.title,
        description: data.description,
        userId: data.user_id,
        user: profileRes.data?.username || 'anonymous',
        createdAt: data.created_at,
        films: (itemsRes.data || []).map((item: { film_id: number; film_title: string; poster_path: string | null; }) => ({
          id: item.film_id,
          title: item.film_title,
          poster_path: item.poster_path,
        })),
        isPrivate: data.is_private,
        isRanked: data.is_ranked,
      };

      return { list: listDetail, endorseCount };
    },
    staleTime: 10 * 60 * 1000,  // 10 min
    enabled: !!id,
  });

  const list = stackQueryData?.list ?? null;
  const loading = stackQueryLoading;
  const [certifyCount, setCertifyCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<ListComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showLoungeShare, setShowLoungeShare] = useState(false);
  const [loadingLounges, setLoadingLounges] = useState(false);
  const [lounges, setLounges] = useState<LoungeItem[]>([]);
  const [sharingTo, setSharingTo] = useState<string | null>(null);

  // Callback isolation: stabilize comment input handler
  const handleCommentTextChange = useCallback((text: string) => {
    setCommentText(text);
  }, []);

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

  // Sync endorsement count from query data
  useEffect(() => {
    if (stackQueryData?.endorseCount !== undefined) {
      setCertifyCount(stackQueryData.endorseCount);
    }
  }, [stackQueryData?.endorseCount]);

  const isOwner = user?.id === list?.userId;
  const isCertified = hasListEndorsed(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loggedIds = new Set(logs.map(l => l.filmId));

  // ── CERTIFY ──
  const handleCertify = useCallback(async () => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const wasCertified = isCertified;
    
    if (wasCertified) {
      setCertifyCount(c => Math.max(0, c - 1));
    } else {
      setCertifyCount(c => c + 1);
    }
    
    try {
      await toggleListEndorse(id);
      if (!wasCertified) reelToast.success('Certified!');
    } catch {
      // Atomic rollback on failure
      setCertifyCount(c => wasCertified ? c + 1 : Math.max(0, c - 1));
      reelToast.error('Certification failed. Reverted.');
    }
  }, [user, id, isCertified, toggleListEndorse]);

  // ── COMMENTS ──
  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('list_comments')
      .select('id, user_id, content, created_at')
      .eq('list_id', id)
      .order('created_at', { ascending: true })
      .limit(30);
    if (!data || data.length === 0) { setComments([]); return; }
    const uids = [...new Set(data.map((c: { user_id: string }) => c.user_id))];
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', uids);
    const umap = Object.fromEntries((profiles || []).map((p: { id: string; username: string }) => [p.id, p.username]));
    setComments(data.map((c: { id: string; user_id: string; content: string; created_at: string; }) => ({ ...c, username: umap[c.user_id] || 'anon' })));
  }, [id]);

  const handleToggleComments = useCallback(() => {
    Haptics.selectionAsync();
    const next = !showComments;
    setShowComments(next);
    if (next) loadComments();
  }, [showComments, loadComments]);

  const handleSubmitComment = useCallback(async () => {
    if (!commentText.trim() || submittingComment || !user) return;
    setSubmittingComment(true);
    const content = commentText.trim();
    const tempId = `temp_${Date.now()}`;
    
    // Optimistic Update
    const optimisticComment: ListComment = {
      id: tempId,
      user_id: user.id,
      username: user.username || 'anon',
      content,
      created_at: new Date().toISOString()
    };
    
    setComments(prev => [...prev, optimisticComment]);
    setCommentText('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const { data, error } = await supabase.from('list_comments').insert([{
        user_id: user.id, list_id: id, content
      }]).select().single();
      
      if (error) throw error;
      
      // Swap temp with real
      setComments(prev => prev.map(c => c.id === tempId ? { ...c, id: data.id } : c));
      
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err: unknown) {
      // Rollback
      setComments(prev => prev.filter(c => c.id !== tempId));
      setCommentText(content);
      reelToast.error('Your critique could not be filed.');
    } finally {
      setSubmittingComment(false);
    }
  }, [commentText, submittingComment, user, id]);

  // ── SHARE TO LOUNGE ──
  const handleOpenShareLounge = useCallback(async () => {
    Haptics.selectionAsync();
    setShowLoungeShare(true);
    setLoadingLounges(true);
    try {
      const { data } = await supabase
        .from('lounge_members')
        .select('lounge_id')
        .eq('user_id', user?.id);
      if (data && data.length > 0) {
        const loungeIds = data.map((r: { lounge_id: string }) => r.lounge_id);
        const { data: loungeData } = await supabase
          .from('lounges')
          .select('id, name, cover_image, is_private')
          .in('id', loungeIds);
        setLounges(loungeData || []);
      } else {
        setLounges([]);
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err: unknown) {
      setLounges([]);
    } finally {
      setLoadingLounges(false);
    }
  }, [user?.id]);

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
          topPosters: list.films.slice(0, 4).map((f: FilmItem) => f.poster_path),
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reelToast.success('Dispatched to the parlour.');
      setTimeout(() => setShowLoungeShare(false), 800);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err: unknown) {
      reelToast.error('Dispatch failed. The courier is delayed.');
    }
    setSharingTo(null);
  };

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Incinerate Stack',
      'This will permanently destroy this collection. This action is irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Incinerate',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteList(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (err: unknown) {
              reelToast.error('The collection resists destruction.');
            }
          },
        },
      ]
    );
  }, [id, deleteList, router]);

  const handlePressFilm = useCallback((filmId: number) => {
    Haptics.selectionAsync();
    router.push(`/film/${filmId}` as any);
  }, [router]);

  const renderItem = useCallback(({ item, index }: { item: FilmItem; index: number }) => {
    return (
      <StackDetailFilmCard 
        item={item} 
        index={index} 
        isLogged={loggedIds.has(item.id)} 
        isRanked={!!list?.isRanked} 
        onPress={handlePressFilm}
        itemWidth={ITEM_WIDTH}
        itemHeight={ITEM_HEIGHT}
      />
    );
  }, [loggedIds, list?.isRanked, handlePressFilm, ITEM_WIDTH, ITEM_HEIGHT]);

  if (loading || !list) {
    return (
      <View style={s.container}>
        <View style={[s.navBar, { zIndex: 10 }]}>
          <PressableScale onPress={() => router.back()} style={s.backBtn} haptic="light" accessibilityLabel="Go back">
            <ArrowLeft size={20} color={colors.bone} />
          </PressableScale>
        </View>
        <View style={s.loadingCenter}>
          <ActivityIndicator size="large" color={colors.sepia} />
        </View>
      </View>
    );
  }



  const heroPoster = list.films.length > 0 && list.films[0].poster_path 
    ? tmdb.poster(list.films[0].poster_path, 'w780') 
    : null;

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      {/* Absolute Dynamic Nav Bar */}
      <View style={[s.navBar, { height: Math.max(insets.top + 50, 70), paddingTop: insets.top }]}>
        <AnimatedBlurView intensity={80} tint="dark" style={[StyleSheet.absoluteFill, navBlurStyle]} />
        <View style={s.navInner}>
          <PressableScale onPress={() => router.back()} style={s.backBtn} hitSlop={{top: 20, bottom: 20, left: 20, right: 20}} haptic="light" accessibilityLabel="Go back">
            <ArrowLeft size={20} color={colors.bone} />
          </PressableScale>
          {isOwner && (
            <View style={s.headerActions}>
              <PressableScale style={s.actionBtn} onPress={() => { router.push({ pathname: '/list-modal', params: { editId: id } } as import('expo-router').Href); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection" accessibilityLabel="Edit stack">
                <Edit3 size={18} color={colors.fog} />
              </PressableScale>
              <PressableScale style={s.actionBtn} onPress={handleDelete} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="medium" accessibilityLabel="Delete stack">
                <Trash2 size={18} color="rgba(231,76,60,0.8)" />
              </PressableScale>
            </View>
          )}
        </View>
      </View>

      <AnimatedFlashList
        data={list.films}
        keyExtractor={(item: any) => String(item.id)}
        numColumns={3}
        contentContainerStyle={s.scrollContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={200}
        removeClippedSubviews={true}
        ListHeaderComponent={
          <>
            {/* Parallax Image Background */}
            <Animated.View style={[s.parallaxHeader, headerStyle]}>
              {heroPoster && (
                <Image source={heroPoster} style={StyleSheet.absoluteFillObject} contentFit="cover" blurRadius={20} cachePolicy="memory-disk" />
              )}
              <LinearGradient 
                colors={['rgba(10, 7, 3, 0.4)', 'rgba(10, 7, 3, 0.9)', colors.ink]}
                locations={[0, 0.6, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            </Animated.View>

            {/* Content Overlaid on Header */}
            <View style={[s.headerContentWrap, { marginTop: HEADER_HEIGHT - 120 }]}>

              <Animated.Text entering={FadeInDown.duration(600).delay(100)} style={s.title} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
                {list.title.toUpperCase()}
              </Animated.Text>
              
              <Animated.View entering={FadeInDown.duration(600).delay(200)} style={s.metaRow}>
                <View style={s.curatorDot} />
                <Text style={[s.metaText, { flexShrink: 1, marginRight: 8 }]} numberOfLines={1}>@{list.user.toUpperCase()}</Text>
                <Text style={s.metaText}>·  {list.films.length} ENTRIES</Text>
                {list.isRanked && (
                  <>
                    <Text style={s.metaText}>  ·  </Text>
                    <Text style={[s.metaText, { color: colors.sepia }]}>✦ RANKED</Text>
                  </>
                )}
              </Animated.View>
              
              {list.description && (
                <Animated.Text entering={FadeInDown.duration(600).delay(300)} style={s.desc}>
                  {list.description}
                </Animated.Text>
              )}

              {/* ── ACTION BAR: Certify · Critic · Share to Lounge ── */}
              <Animated.View entering={FadeInDown.duration(600).delay(350)} style={s.actionBar}>
                <PressableScale style={s.actionItem} onPress={handleCertify} haptic="selection" accessibilityRole="button" accessibilityLabel={isCertified ? "Uncertify stack" : "Certify stack"}>
                  <Award size={16} color={isCertified ? colors.sepia : colors.fog} fill={isCertified ? colors.sepia : 'none'} />
                  <Text style={[s.actionLabel, isCertified && s.actionLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {certifyCount > 0 ? `${certifyCount} ` : ''}{isCertified ? 'CERTIFIED' : 'CERTIFY'}
                  </Text>
                </PressableScale>

                <View style={s.actionDivider} />

                <PressableScale style={s.actionItem} onPress={handleToggleComments} haptic="selection" accessibilityRole="button" accessibilityLabel="Toggle comments">
                  <MessageCircle size={14} color={showComments ? colors.sepia : colors.fog} />
                  <Text style={[s.actionLabel, showComments && s.actionLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>CRITIC</Text>
                </PressableScale>

                <View style={s.actionDivider} />

                <PressableScale style={s.actionItem} onPress={handleOpenShareLounge} haptic="selection" accessibilityRole="button" accessibilityLabel="Share to lounge">
                  <Send size={14} color={colors.fog} />
                  <Text style={s.actionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>LOUNGE</Text>
                </PressableScale>
              </Animated.View>

              {/* ── COMMENTS PANEL ── */}
              {showComments && (
                <Animated.View entering={FadeInDown.duration(300)} style={s.commentsPanel}>
                  {comments.length === 0 && (
                    <Text style={s.commentEmpty}>No remarks yet. Be the first to speak.</Text>
                  )}
                  {comments.map(c => (
                    <StackCommentRow key={c.id} c={c} />
                  ))}
                  {user && (
                    <View style={s.commentInputRow}>
                      <TextInput
                        style={s.commentInput}
                        placeholder="Leave a remark..."
                        placeholderTextColor={colors.ash}
                        value={commentText}
                        onChangeText={handleCommentTextChange}
                        returnKeyType="send"
                        onSubmitEditing={handleSubmitComment}
                        maxLength={500}
                        selectionColor={'rgba(218,165,32,0.3)'}
                        cursorColor={colors.sepia}
                        disableFullscreenUI={true}
                        keyboardAppearance="dark"
                        accessibilityLabel="Stack comment"
                      />
                      <PressableScale onPress={handleSubmitComment} disabled={submittingComment || !commentText.trim()} style={[s.commentSendBtn, (!commentText.trim()) && s.sendBtnDisabled]} haptic="light" accessibilityRole="button" accessibilityLabel="Submit comment">
                        <Send size={14} color={colors.sepia} />
                      </PressableScale>
                    </View>
                  )}
                </Animated.View>
              )}

              <View style={s.trackRow}>
                <Text style={s.trackLabel}>INDEXED REELS</Text>
                <View style={s.trackLine} />
              </View>
            </View>
          </>
        }
        renderItem={renderItem as any}
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
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowLoungeShare(false)} accessible={false} importantForAccessibility="no-hide-descendants" />
          <View style={s.loungeSheet}>
            <View style={s.loungeHeader}>
              <Send size={14} color={colors.sepia} />
              <Text style={s.loungeTitle}>SHARE TO LOUNGE</Text>
              <PressableScale onPress={() => setShowLoungeShare(false)} hitSlop={{top: 20, bottom: 20, left: 20, right: 20}} haptic="light" accessibilityRole="button" accessibilityLabel="Close lounge share">
                <Text style={s.loungeClose}>✕</Text>
              </PressableScale>
            </View>
            {loadingLounges ? (
              <View style={s.loungeEmptyWrap}>
                <ActivityIndicator size="small" color={colors.sepia} />
              </View>
            ) : lounges.length === 0 ? (
              <View style={s.loungeEmptyWrap}>
                <Text style={s.loungeEmptyText}>No lounges found. Join or create one first.</Text>
              </View>
            ) : (
              lounges.map(lounge => (
                <PressableScale
                  key={lounge.id}
                  style={s.loungeRow}
                  onPress={() => handleShareToLounge(lounge.id)}
                  disabled={!!sharingTo}
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel={`Share to ${lounge.name}`}
                >
                  <View style={s.loungeAvatar}>
                    {lounge.cover_image ? (
                      <Image source={tmdb.poster(lounge.cover_image, 'w92')} style={s.loungeAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                      <MessageCircle size={12} color={colors.sepia} />
                    )}
                  </View>
                  <Text style={s.loungeName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{lounge.name}</Text>
                  <View style={s.loungeSendIcon}>
                    {sharingTo === lounge.id ? (
                      <ActivityIndicator size="small" color={colors.sepia} />
                    ) : (
                      <Send size={12} color={colors.sepia} />
                    )}
                  </View>
                </PressableScale>
              ))
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  navBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    zIndex: 100, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  navInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backBtn: { padding: 8, marginLeft: -8 },
  headerActions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 8 },

  scrollContent: { paddingBottom: 60 },
  parallaxHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: -1 },
  headerContentWrap: { paddingHorizontal: 16, paddingBottom: 24 },
  
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
  commentUser: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 0.5, color: colors.sepia, flexShrink: 1, maxWidth: '40%' },
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
  
  filmItem: { marginBottom: 24, marginHorizontal: 4 },
  filmCard: { borderRadius: 2, overflow: 'hidden', backgroundColor: colors.soot, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)' },
  posterPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  placeholderText: { fontFamily: fonts.sub, fontSize: 10, color: colors.ash, textAlign: 'center' },
  loggedBadge: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  filmTitle: { fontFamily: fonts.sub, fontSize: 11, color: colors.fog, marginTop: 6, textAlign: 'center', paddingHorizontal: 2 },
  
  rankBadgeWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, justifyContent: 'flex-end', paddingBottom: 6, paddingLeft: 8 },
  rankNumber: { fontFamily: fonts.display, fontSize: 28, color: colors.parchment, lineHeight: 28, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, marginBottom: 8 },
  emptySubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.fog, textAlign: 'center' },

  // Extracted
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actionLabelActive: { color: colors.sepia },
  sendBtnDisabled: { opacity: 0.3 },
  loungeEmptyWrap: { padding: 30, alignItems: 'center' },
  loungeEmptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.fog },
  loungeAvatarImg: { width: '100%', height: '100%' },
});


StackDetailFilmCard.displayName = 'StackDetailFilmCard';

StackCommentRow.displayName = 'StackCommentRow';