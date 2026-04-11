import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Platform, FlatList, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Edit3, Trash2, CheckCircle2 } from 'lucide-react-native';

import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { supabase } from '@/src/lib/supabase';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';

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
  const { logs } = useFilmStore();

  const [list, setList] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

      const { data: profile } = await supabase.from('profiles').select('username').eq('id', data.user_id).single();
      const { data: items } = await supabase.from('list_items').select('film_id, film_title, poster_path').eq('list_id', id);

      setList({
        id: data.id,
        title: data.title,
        description: data.description,
        userId: data.user_id,
        user: profile?.username || 'anonymous',
        createdAt: data.created_at,
        films: (items || []).map((item: any) => ({
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
  const loggedIds = new Set(logs.map(l => l.filmId));

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
