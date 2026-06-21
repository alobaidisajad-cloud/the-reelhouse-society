import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator, ScrollView, Platform } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withTiming, useAnimatedKeyboard } from 'react-native-reanimated';
import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Sparkles, Film, ArrowRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import reelToast from '@/src/utils/reelToast';
import PressableScale from '@/src/components/PressableScale';

interface OracleFilm {
  id: number;
  title?: string;
  poster_path?: string | null;
  release_date?: string;
  overview?: string;
  media_type?: string;
}

const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

export default function OracleScreen() {

  const insets = useSafeAreaInsets();
  
  const keyboard = useAnimatedKeyboard();
  const animatedContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'ios' ? keyboard.height.value : 0,
  }));
  
  const [mood, setMood] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<OracleFilm[]>([]);
  // FIX #7: Track whether a search has been submitted to show empty state
  const [hasSearched, setHasSearched] = useState(false);
  const mountedRef = React.useRef(true);
  // FIX #6: Track the 'thinking' setTimeout so it can be cleaned up on unmount
  const thinkingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => { return () => { mountedRef.current = false; if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current); }; }, []);

  // Nitrate Noir Breathing Ember Protocol
  const oracleEmberOpacity = useSharedValue(0.5);
  const oracleEmberStyle = useAnimatedStyle(() => ({
    opacity: oracleEmberOpacity.value,
  }));

  // Callback isolation: stabilize input handler
  const handleMoodChange = useCallback((text: string) => {
    setMood(text);
  }, []);

  const askOracle = useCallback(async () => {
    if (!mood.trim()) return;
    TactileEngine.mutate();
    setLoading(true);
    setRecommendations([]);
    setHasSearched(true);

    // Activate Breathing Ember during Oracle divination
    oracleEmberOpacity.value = withTiming(1, { duration: 600 });

    try {
      // In a real env, this hits a custom Supabase edge function or OpenAI API.
      // For this native parity showcase without exposing heavy API keys on client:
      // We will perform a keyword TMDB search based on the mood.
      const searchRes = await tmdb.search(mood);
      const movies = (searchRes?.results || [])
        .filter((r: { media_type?: string }) => r.media_type === 'movie' || r.media_type === undefined) // TMDB search endpoints sometime omit media_type for keyword endpoints
        .slice(0, 5) as OracleFilm[];
      
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) return; // Guard: skip if unmounted
        setRecommendations(movies);
        setLoading(false);
        oracleEmberOpacity.value = withTiming(0.5, { duration: 300 });
        TactileEngine.success();
      }, 500); // Brief dramatic pause — entrance animations handle the rest
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      setLoading(false);
      oracleEmberOpacity.value = withTiming(0.5, { duration: 300 });
      reelToast.error('The Oracle\'s connection to the archive was severed. Try again.');
    }
  }, [mood, oracleEmberOpacity]);

  return (
    <Animated.View style={[s.container, animatedContainerStyle]}>
      <LinearGradient 
        colors={['#1a1510', colors.ink]} 
        locations={[0, 0.4]}
        style={StyleSheet.absoluteFillObject} 
      />
      
      <View style={[s.navBar, { paddingTop: insets.top + 12 }]}>
        <PressableScale onPress={() => nav.back()} style={s.backBtn} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light" accessibilityRole="button" accessibilityLabel="Go back">
          <ArrowLeft size={20} color={colors.bone} />
        </PressableScale>
      </View>

      <ScrollView 
        contentContainerStyle={s.scrollContent} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(800).springify()} style={s.header}>
          <View style={s.iconWrap}>
            <Sparkles size={24} color={colors.sepia} />
          </View>
          <Text style={s.eyebrow}>THE ORACLE</Text>
          <Text style={s.title}>Consult the Archives</Text>
          <Text style={s.subtitle}>
            Enter a keyword, mood, or genre. The Archive will surface films that match your cinematic craving.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(800).delay(200).springify()} style={s.inputSection}>
          <Animated.View style={[{ borderRadius: 2, overflow: 'hidden' }, oracleEmberStyle]}>
            <TextInput
              style={s.input}
              placeholder="E.g. A melancholic neon-soaked thriller in Tokyo..."
              placeholderTextColor={colors.fog}
              value={mood}
              onChangeText={handleMoodChange}
              multiline
              textAlignVertical="top"
              selectionColor={'rgba(218,165,32,0.3)'}
              cursorColor={colors.sepia}
              keyboardAppearance="dark"
              accessibilityLabel="Describe your desired film mood or aesthetic"
            />
          </Animated.View>
          <PressableScale 
            style={[s.submitBtn, (!mood.trim() || loading) && s.submitBtnDisabled]} 
            onPress={askOracle}
            disabled={!mood.trim() || loading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            pressedScale={0.97}
            accessibilityLabel="Ask the oracle"
          >
            {loading ? (
              <ActivityIndicator color={colors.ink} size="small" />
            ) : (
              <Text style={s.submitText}>DIVINE</Text>
            )}
          </PressableScale>
        </Animated.View>

        {loading && (
          <Animated.View entering={FadeInUp} style={s.loadingState}>
             <Text style={s.loadingText}>The Oracle is sifting through 100 years of cinema...</Text>
          </Animated.View>
        )}

        {recommendations.length > 0 && (
          <Animated.View entering={FadeInUp.duration(600).springify()} style={s.resultsSection}>
            <Text style={s.resultsHeader}>THE ORACLE PROPOSES:</Text>
            {recommendations.map((item, index) => {
              const posterUri = item.poster_path ? tmdb.poster(item.poster_path, 'w342') : null;
              return (
                <Animated.View key={item.id} entering={FadeInUp.delay(index * 150)}
                  onLayout={() => { if (index === 0) TactileEngine.selection(); }}
                >
                  <PressableScale 
                    style={s.resultCard}
                    onPress={() => nav.push(`/film/${item.id}`)}
                    hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                    accessibilityLabel={`View ${item.title}`}
                  >
                    {posterUri ? (
                      <Image source={{ uri: posterUri }} style={s.poster} contentFit="cover" cachePolicy="memory-disk" placeholder={blurhash} transition={300} />
                    ) : (
                      <View style={[s.poster, s.noPoster]}>
                        <Film size={24} color={colors.fog} />
                      </View>
                    )}
                    <View style={s.resultInfo}>
                      <Text style={s.resultTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={s.resultYear}>{item.release_date?.substring(0,4) || 'Unknown'}</Text>
                      <Text style={s.resultDesc} numberOfLines={3}>{item.overview}</Text>
                    </View>
                    <ArrowRight size={16} color={colors.sepia} style={{ marginRight: 16 }} />
                  </PressableScale>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}

        {/* FIX #7: Empty result state when Oracle finds nothing */}
        {!loading && hasSearched && recommendations.length === 0 && (
          <Animated.View entering={FadeInUp.duration(400)} style={s.emptyResult}>
            <Text style={s.emptyResultText}>The Oracle found no films matching that description. Try different keywords or broaden your request.</Text>
          </Animated.View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  navBar: {
    paddingHorizontal: 16, paddingBottom: 16, zIndex: 10,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  
  header: { alignItems: 'center', marginTop: 20, marginBottom: 30 },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(139,105,20,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
  },
  eyebrow: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, marginBottom: 16, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
  
  inputSection: { marginBottom: 30 },
  input: {
    backgroundColor: 'rgba(10, 7, 3, 0.6)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)',
    borderRadius: 2, padding: 16, height: 120,
    fontFamily: fonts.body, fontSize: 15, color: colors.bone,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.1, shadowRadius: 10,
  },
  submitBtn: {
    backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 16,
    alignItems: 'center', marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontFamily: fonts.uiBold, fontSize: 13, letterSpacing: 3, color: colors.ink },
  
  loadingState: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { fontFamily: fonts.sub, fontSize: 14, color: colors.sepia, fontStyle: 'italic', marginTop: 16 },
  
  resultsSection: { marginTop: 10 },
  resultsHeader: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog, marginBottom: 16, marginLeft: 4 },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot,
    borderRadius: 2, marginBottom: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  poster: { width: 80, height: 120, backgroundColor: colors.ash },
  noPoster: { alignItems: 'center', justifyContent: 'center', opacity: 0.2 },
  resultInfo: { flex: 1, padding: 16 },
  resultTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 4 },
  resultYear: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia, marginBottom: 8 },
  resultDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, lineHeight: 18 },
  // FIX #7: Empty result styles
  emptyResult: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyResultText: { fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22 },
});
