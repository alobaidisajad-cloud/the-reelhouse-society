import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput, KeyboardAvoidingView, Platform, Image, Share, ImageBackground, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/src/stores/auth';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts } from '@/src/theme/theme';
import { SectionDivider, ReelRating } from '@/src/components/Decorative';
import { tmdb } from '@/src/lib/tmdb';
import { captureRef } from 'react-native-view-shot';
import LogShareCard from '@/src/components/film/LogShareCard';
import { Heart, MessageSquare, Edit3, MessageCircle } from 'lucide-react-native';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';
const AnimatedView = Animated.createAnimatedComponent(View);

function timeAgo(dateStr: string | Date | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'JUST NOW';
  if (mins < 60) return `${mins}m AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h AGO`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d AGO`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
}

export default function LogDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [log, setLog] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autopsyOpen, setAutopsyOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const viewShotRef = useRef<View>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      // Fetch Log + User Info
      const { data: logData } = await supabase
        .from('logs')
        .select('*, profiles!logs_user_id_fkey(username, avatar_url, display_name)')
        .eq('id', id)
        .single();
      
      if (logData) {
        setLog(logData);
        setProfile(Array.isArray(logData.profiles) ? logData.profiles[0] : logData.profiles);
      }

      // Fetch Comments
      const { data: commData } = await supabase
        .from('log_comments')
        .select('*')
        .eq('log_id', id)
        .order('created_at', { ascending: true });
        
      setComments(commData || []);
    } catch { }
  }, [id]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handlePostComment = async () => {
    if (!isAuthenticated) return router.push('/login');
    if (!newComment.trim() || posting) return;

    setPosting(true);
    try {
      const { data, error } = await supabase.from('log_comments').insert({
        log_id: id,
        user_id: user?.id,
        username: user?.username,
        body: newComment.trim(),
      }).select().single();

      if (!error && data) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setComments(prev => [...prev, data]);
        setNewComment('');

        // Notify poster if not self
        if (log.user_id !== user?.id) {
          await supabase.from('notifications').insert({
            user_id: log.user_id,
            type: 'comment',
            from_username: user?.username,
            message: `@${user?.username} added a critique to your log of ${log.film_title}`,
          });
        }
      }
    } catch { 
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      await supabase.from('log_comments').delete().eq('id', commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {}
  };

  const handleShare = async () => {
    if (!viewShotRef.current) return;
    setSharing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
      });

      await Share.share({
        url: uri, // Triggers native sheet with image payload
        message: `Check out my log for ${log.film_title} on ReelHouse.`, 
      });
    } catch {
       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
       setSharing(false);
    }
  };

  if (loading) return <View style={s.container} />;

  if (!log) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.fog, fontFamily: fonts.body }}>Log not found.</Text>
        <TouchableOpacity style={s.backBtnRow} onPress={() => router.back()}>
            <Text style={s.backBtnText}>← GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const posterUri = log.poster_path ? `${TMDB_IMG}${log.poster_path}` : null;
  const isPoster = user?.id === log.user_id;

  const isAuteur = profile?.role === 'auteur' || (profile as any)?.role === 'god';
  const isArchivist = profile?.role === 'archivist';

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={s.container}
    >
      {/* ── IMMERSIVE FULL-BLEED BACKDROP (BEHIND SCROLLVIEW) ── */}
      {(log.editorial_header || posterUri) && (
          <View style={[StyleSheet.absoluteFillObject, { height: 360 }]}>
             <ImageBackground 
                source={{ uri: log.editorial_header ? `${TMDB_IMG.replace('w185', 'w1280')}${log.editorial_header}` : (posterUri || '') }} 
                style={{ width: '100%', height: '100%' }}
                imageStyle={{ opacity: log.editorial_header ? 0.3 : 0.2 }}
                blurRadius={4}
             >
                <LinearGradient colors={['rgba(10,7,3,0)', 'rgba(10,7,3,0.4)', 'rgba(10,7,3,0.95)', colors.ink]} style={StyleSheet.absoluteFillObject} />
                {/* Scan lines texture — Web: repeating-linear-gradient for film grain */}
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.03)' }]} />
                
                {log.editorial_header && (
                  <View style={[s.editorialBadge, { top: 90, left: 16 }]}>
                    <Text style={s.editorialBadgeText}>✦ EDITORIAL</Text>
                  </View>
                )}
             </ImageBackground>
          </View>
      )}

      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7} hitSlop={{top:10,bottom:10,left:10,right:10}}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} />
        <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.7}>
           <Text style={s.shareBtnText}>{sharing ? '...' : 'SHARE'}</Text>
        </TouchableOpacity>
      </View>

      {/* Hidden Share Card */}
      <View style={{ position: 'absolute', top: -10000, left: 0 }} collapsable={false}>
         <View ref={viewShotRef} collapsable={false} style={{ backgroundColor: colors.ink }}>
            <LogShareCard data={{
               filmTitle: log.film_title,
               year: log.year?.toString(),
               posterUri: posterUri || '',
               backdropUri: posterUri ? `${TMDB_IMG.replace('w185','w500')}${log.poster_path}` : undefined,
               rating: log.rating,
               review: log.pull_quote || log.review,
               username: profile?.username || 'unknown',
               role: profile?.role
            }} />
         </View>
      </View>

      <ScrollView 
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.sepia} />}
      >
        {/* Transparent Padder for Parallax Overlap — Web: height IS_TOUCH ? '10vh' ≈ 80px */}
        <View style={{ height: 80, width: '100%' }} />

        {/* Overlapping Content Card — Web: bg rgba(10,7,3,0.85), backdropFilter blur(16px), borderRadius 12px 12px 0 0, boxShadow 0 -20px 40px rgba(0,0,0,0.8) */}
        <View style={{ backgroundColor: isAuteur ? 'rgba(25,10,10,0.92)' : 'rgba(10,7,3,0.92)', minHeight: 800, borderTopWidth: 1, borderColor: isAuteur ? 'rgba(180,45,45,0.25)' : 'rgba(139,105,20,0.15)', borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: -20 }, shadowOpacity: 0.8, shadowRadius: 40, elevation: 24 }}>
          {isAuteur && (
            <LinearGradient colors={['rgba(125,31,31,0.08)', 'transparent']} start={{x: 0, y: 0}} end={{x: 0.5, y: 0.5}} style={StyleSheet.absoluteFillObject} />
          )}
        
        <AnimatedView entering={FadeInDown.duration(600)} style={[s.logCard, { marginTop: 0, paddingTop: 24 }]}>
          
          <View style={{ alignItems: 'center' }}>
            {/* TOP: User Info — Web: fontSize 0.75rem=12px, ls 0.15em=1.8px, color var(--sepia) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 24, width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <TouchableOpacity onPress={() => isPoster ? router.push(`/user/${profile?.username}`) : null} activeOpacity={0.7}>
                  <Text style={s.userRefText} numberOfLines={1}>@{(profile?.username || 'unknown').toUpperCase()}</Text>
                </TouchableOpacity>
                {isArchivist && (
                  <View style={s.archivistBadge}>
                    <Text style={s.archivistBadgeText}>✦ ARCHIVIST</Text>
                  </View>
                )}
                {isAuteur && (
                  <View style={s.auteurBadge}>
                    <Text style={{ fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 1, color: colors.ink }}>★ AUTEUR</Text>
                  </View>
                )}
              </View>
              <Text style={s.timestamp}>{timeAgo(log.created_at)}</Text>
            </View>

            {/* CENTER: Poster Component — Web: 140x210, radial glow behind for premium */}
            <View style={{ width: '100%', alignItems: 'center', marginBottom: 24, zIndex: 10 }}>
              {/* Premium radial glow behind poster */}
              {(isAuteur || isArchivist) && posterUri && (
                <View style={{ position: 'absolute', top: '50%', left: '50%', width: 180, height: 250, marginLeft: -90, marginTop: -125, backgroundColor: isAuteur ? 'rgba(125,31,31,0.12)' : 'rgba(139,105,20,0.12)', borderRadius: 125, zIndex: 0 }} />
              )}
              <TouchableOpacity onPress={() => router.push(`/film/${log.film_id}`)} activeOpacity={0.8} style={[s.posterBounds, isAuteur && s.posterBoundsAuteur]}>
                {posterUri ? (
                  <Image source={{ uri: posterUri }} style={s.posterCentered} />
                ) : (
                  <View style={[s.posterCentered, { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.sepia }}>?</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* BOTTOM: Title & Meta — Web: clamp(2rem,8vw,2.75rem), lineHeight 1.1, textShadow 0 4px 12px */}
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <TouchableOpacity onPress={() => router.push(`/film/${log.film_id}`)} activeOpacity={0.8}>
                 <Text style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 35, color: colors.parchment, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width:0,height:4}, textShadowRadius: 12 }}>{log.film_title}</Text>
              </TouchableOpacity>
              {log.year && <Text style={{ fontFamily: fonts.ui, fontSize: 12, letterSpacing: 3.6, color: colors.fog, marginTop: 8 }}>{log.year}</Text>}
            </View>

            {log.rating > 0 && (
              <View style={{ marginTop: 12 }}>
                <ReelRating rating={log.rating} size={18} />
              </View>
            )}
          </View>

          {/* Full Width Review / Pull Quote — Web: padding 1.5rem 1.5rem, textAlign center */}
          <View style={{ marginTop: 24, marginBottom: 16, paddingHorizontal: 24 }}>
            {log.pull_quote ? (
              <View style={s.featuredQuoteWrap}>
                 {/* Ornamental divider */}
                 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
                   <View style={{ flex: 1, maxWidth: 80, height: 1, backgroundColor: 'rgba(139,105,20,0.4)' }} />
                   <Text style={{ fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 4.8, color: colors.sepia, opacity: 0.7 }}>✦</Text>
                   <View style={{ flex: 1, maxWidth: 80, height: 1, backgroundColor: 'rgba(139,105,20,0.4)' }} />
                 </View>
                 <Text style={[s.featuredQuote, isAuteur && { color: 'rgba(180,45,45,0.9)', textShadowColor: 'rgba(125,31,31,0.15)' }]}>« {log.pull_quote} »</Text>
                 {/* Ornamental divider bottom */}
                 <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                   <View style={{ flex: 1, maxWidth: 80, height: 1, backgroundColor: 'rgba(139,105,20,0.4)' }} />
                   <Text style={{ fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 4.8, color: colors.sepia, opacity: 0.7 }}>✦</Text>
                   <View style={{ flex: 1, maxWidth: 80, height: 1, backgroundColor: 'rgba(139,105,20,0.4)' }} />
                 </View>
              </View>
            ) : log.review ? (
              <View style={s.reviewBodyWrap}>
                 {log.drop_cap ? (
                   <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                     <Text style={[s.review, { fontFamily: fonts.display, fontSize: 40, color: colors.sepia, lineHeight: 35, marginRight: 8, marginTop: -3, textShadowColor: 'rgba(139,105,20,0.2)', textShadowOffset: {width:0, height:2}, textShadowRadius: 8 }]}>
                       {log.review.replace(/<[^>]+>/g, '').trim().charAt(0)}
                     </Text>
                     <Text style={[s.review, { flex: 1, paddingTop: 3 }]}>
                       {log.review.replace(/<[^>]+>/g, '').trim().slice(1)}
                     </Text>
                   </View>
                 ) : (
                   <Text style={s.review}>{log.review.replace(/<[^>]+>/g, '').trim()}</Text>
                 )}
              </View>
            ) : null}
          </View>

          {/* Autopsy Celluloid Gauge */}
          {(log.is_autopsied || log.isAutopsied) && log.autopsy && (
            <View style={{ paddingHorizontal: 16 }}>
               <TouchableOpacity 
                  onPress={() => { Haptics.selectionAsync(); setAutopsyOpen(!autopsyOpen); }} 
                  activeOpacity={0.7} 
                  style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16, backgroundColor: 'rgba(11,10,8,0.95)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(139,105,20,0.25)', borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: -1, zIndex: 2 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <AnimatedView style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia, shadowColor: 'rgba(139,105,20,0.6)', shadowOffset: {width:0, height:0}, shadowRadius: 8, shadowOpacity: 1 }} />
                    <Text style={{ fontFamily: fonts.display, fontSize: 12, letterSpacing: 2.5, color: colors.parchment }}>THE AUTOPSY</Text>
                    <Text style={{ fontFamily: fonts.ui, fontSize: 7, letterSpacing: 3, color: colors.sepia, opacity: 0.6 }}>CONFIDENTIAL</Text>
                  </View>
                  <Text style={{ fontFamily: fonts.ui, fontSize: 8, color: colors.fog, transform: [{ rotate: autopsyOpen ? '180deg' : '0deg' }] }}>▼</Text>
               </TouchableOpacity>

               {autopsyOpen && (
                 <AnimatedView entering={FadeInDown.duration(400)} style={s.autopsyCard}>
                   <View style={{ gap: 24 }}>
                     {[
                        { key: 'story', label: 'STORY', value: log.autopsy.story !== undefined ? log.autopsy.story : log.autopsy.screenplay || 0 },
                        { key: 'script', label: 'SCRIPT / DIALOGUE', value: log.autopsy.script !== undefined ? log.autopsy.script : log.autopsy.screenplay || 0 },
                        { key: 'acting', label: 'ACTING & CHARACTER', value: log.autopsy.acting || log.autopsy.direction || 0 },
                        { key: 'cinematography', label: 'CINEMATOGRAPHY', value: log.autopsy.cinematography || 0 },
                        { key: 'editing', label: 'EDITING & PACING', value: log.autopsy.editing !== undefined ? log.autopsy.editing : log.autopsy.pacing || 0 },
                        { key: 'sound', label: 'SOUND DESIGN & SCORE', value: log.autopsy.sound || 0 },
                     ].map(item => (
                       <View key={item.key}>
                         <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
                           <Text style={s.autopsyLabel}>{item.label}</Text>
                           <Text style={s.autopsyValue}>{item.value === 10 ? '10.0' : parseFloat(String(item.value)).toFixed(1)}</Text>
                         </View>
                         <View style={s.autopsyTrack}>
                           <LinearGradient colors={[colors.sepia, '#5a430d']} style={[s.autopsyFill, { width: `${(item.value / 10) * 100}%` }]} start={{x:0, y:0}} end={{x:0, y:1}} />
                         </View>
                       </View>
                     ))}
                   </View>
                 </AnimatedView>
               )}
            </View>
          )}

          {/* Action Deck — Web: grid 4×1fr, gap 1px, bg rgba(139,105,20,0.15), border 1px rgba(139,105,20,0.2), borderRadius 6px */}
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(139,105,20,0.15)', borderRadius: 6, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', marginBottom: 16, overflow: 'hidden', padding: 1, gap: 1, zIndex: 1 }}>
               <TouchableOpacity style={s.deckBtn} onPress={isPoster ? undefined : () => Alert.alert("Certified", "Coming Soon")}>
                  <Heart size={16} strokeWidth={2} color={isPoster ? colors.sepia : colors.fog} fill={isPoster ? colors.sepia : 'transparent'} />
                  <Text style={[s.deckLabel, isPoster && { color: colors.sepia }]}>{isPoster ? 'CERTIFIED' : 'CERT'}</Text>
               </TouchableOpacity>

               <TouchableOpacity style={s.deckBtn} onPress={() => Alert.alert("Critique", "Comment below")}>
                  <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
                  <Text style={s.deckLabel}>CRITIQUE</Text>
               </TouchableOpacity>

               <TouchableOpacity style={s.deckBtn} onPress={() => Alert.alert("Edit", "Coming Soon")}>
                  <Edit3 size={16} strokeWidth={2} color={colors.fog} />
                  <Text style={s.deckLabel}>EDIT</Text>
               </TouchableOpacity>

               <TouchableOpacity style={s.deckBtn} onPress={() => Alert.alert("Lounge", "Coming Soon")}>
                  <MessageCircle size={16} strokeWidth={2} color={colors.fog} />
                  <Text style={s.deckLabel}>LOUNGE</Text>
               </TouchableOpacity>
            </View>
          </View>

        </AnimatedView>


        
        <View style={s.commentsSection}>
          <SectionDivider label={`CRITIQUES (${comments.length})`} />
          
          {comments.map((c: any) => (
             <View key={c.id} style={s.commentItem}>
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                 <TouchableOpacity onPress={() => router.push(`/user/${c.username}`)} activeOpacity={0.7}>
                   <Text style={s.commUsername}>@{c.username}</Text>
                 </TouchableOpacity>
                 <Text style={s.commDate}>{new Date(c.created_at).toLocaleDateString()}</Text>
               </View>
               <Text style={s.commBody}>{c.body}</Text>
               {user?.id === c.user_id && (
                 <TouchableOpacity onPress={() => handleDeleteComment(c.id)} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
                   <Text style={s.commDelete}>DELETE</Text>
                 </TouchableOpacity>
               )}
             </View>
          ))}

          {comments.length === 0 && (
             <Text style={s.emptyComments}>No critiques yet. Leave a mark on this record.</Text>
          )}

          {/* Inline Critique Input — Web: AnnotationPanel style */}
          <View style={s.critiqueInputWrap}>
            <TextInput
              style={s.critiqueInput}
              placeholder="File an enduring critique..."
              placeholderTextColor={colors.fog}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={500}
              selectionColor={colors.sepia}
            />
            <TouchableOpacity 
              style={[s.critiqueSubmitBtn, { opacity: newComment.trim() ? 1 : 0.4 }]} 
              onPress={handlePostComment} 
              disabled={!newComment.trim() || posting} 
              activeOpacity={0.7}
            >
              <Text style={s.critiqueSubmitText}>{posting ? 'FILING...' : 'SUBMIT CRITIQUE'}</Text>
              <Text style={{ fontFamily: fonts.ui, fontSize: 12, color: colors.ink }}>✦</Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  header: {
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash,
  },
  backBtn: { width: 50 },
  backIcon: { fontFamily: fonts.ui, fontSize: 24, color: colors.sepia },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.bone },
  shareBtn: { width: 50, alignItems: 'flex-end', justifyContent: 'center' },
  shareBtnText: { fontFamily: fonts.uiBold, fontSize: 10, color: colors.sepia, letterSpacing: 1 },
  
  content: { paddingBottom: 40 },
  
  // Log Details — Mathematical translation from Web CSS
  // Web: padding IS_TOUCH 1.5rem 1rem = 24px 16px
  logCard: { paddingHorizontal: 16, paddingBottom: 16 },
  // Web: fontSize 0.75rem=12px, ls 0.15em=1.8px, color var(--sepia), textTransform uppercase
  userRefText: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1.8, color: colors.sepia, textTransform: 'uppercase' },
  // Web: fontSize 0.65rem=10.4px, ls 0.2em=2.08px, color var(--fog)
  timestamp: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
  // Web: fontSize 0.4rem=6.4px, padding 0.1rem 0.5rem = 1.6px 8px
  archivistBadge: { paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(196,150,26,0.1)', borderWidth: 1, borderColor: 'rgba(196,150,26,0.3)', borderRadius: 2 },
  archivistBadgeText: { fontFamily: fonts.ui, fontSize: 6.5, letterSpacing: 1, color: colors.sepia },
  auteurBadge: { paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#DAA520', borderRadius: 2 },

  // Web: width 140px height 210px, borderRadius 2px, border 1px rgba(196,150,26,0.35), boxShadow 0 20px 40px rgba(0,0,0,0.8) + 0 0 30px rgba(139,105,20,0.1)
  posterBounds: { width: 140, height: 210, borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(196,150,26,0.35)', backgroundColor: colors.soot, shadowColor: '#000', shadowOffset: {width: 0, height: 20}, shadowOpacity: 0.8, shadowRadius: 40, elevation: 12 },
  posterBoundsAuteur: { borderColor: 'rgba(180,45,45,0.35)', shadowColor: 'rgba(125,31,31,0.2)', shadowOffset: {width:0, height:20}, shadowOpacity: 0.8, shadowRadius: 40 },
  posterCentered: { width: '100%', height: '100%', resizeMode: 'cover' },
  
  // Web ACTION DECK button: padding 1rem 0 = 16px 0, gap 0.5rem=8px, bg var(--ink), borderRadius 4px
  deckBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8, backgroundColor: colors.ink, borderRadius: 4 },
  // Web: fontSize 0.45rem=7.2px, ls 0.15em=1.08px
  deckLabel: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 1.1, color: colors.fog },
  
  // Web Pull Quote: padding 1.5rem, fontSize clamp(1.2rem,5vw,1.6rem)≈20px, lineHeight 1.35, textAlign center
  featuredQuoteWrap: { paddingVertical: 24, alignItems: 'center' },
  featuredQuoteLogo: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 4, color: colors.sepia, opacity: 0.8 },
  featuredQuote: { fontFamily: fonts.display, fontSize: 20, color: colors.sepia, fontStyle: 'italic', lineHeight: 27, textAlign: 'center', textShadowColor: 'rgba(139,105,20,0.15)', textShadowOffset: {width:0, height:2}, textShadowRadius: 12 },
  
  // Web Review: fontSize 0.95rem=15.2px, lineHeight 1.85→28, padding 0 1.5rem=0 24px
  reviewBodyWrap: { paddingHorizontal: 0, marginTop: 0 },
  review: { fontFamily: fonts.body, fontSize: 15, color: colors.bone, lineHeight: 28, opacity: 0.9 },

  // Web Editorial Badge: top 1.5rem=24px, left 1.5rem=24px
  editorialBadge: { position: 'absolute', top: 24, left: 24, backgroundColor: 'rgba(11,10,8,0.5)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(196,150,26,0.2)' },
  editorialBadgeText: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2.2, color: 'rgba(218,165,32,0.85)' },

  // Autopsy — Web: border 1px rgba(139,105,20,0.25), borderRadius 4px
  autopsyCard: { backgroundColor: colors.ink, padding: 24, borderRadius: 2, borderWidth: 1, borderColor: colors.ash, borderTopWidth: 0, marginTop: -2, borderTopLeftRadius: 0, borderTopRightRadius: 0, shadowColor: '#000', shadowOffset: {width:0, height:10}, shadowOpacity: 0.5, shadowRadius: 10 },
  autopsyLabel: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog },
  autopsyValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 22, color: colors.parchment, opacity: 0.85, letterSpacing: 1 },
  autopsyTrack: { width: '100%', height: 8, backgroundColor: colors.soot, borderRadius: 1, borderWidth: 1, borderColor: 'rgba(10, 7, 3, 0.8)', overflow: 'hidden' },
  autopsyFill: { height: '100%' },

  // Comments — Web: AnnotationPanel styles
  commentsSection: { paddingHorizontal: 16, marginTop: 16, paddingBottom: 40 },
  emptyComments: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic', color: colors.fog, textAlign: 'center', marginTop: 24 },
  commentItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.ash },
  commUsername: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  commBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20 },
  commDate: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog },
  commDelete: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 1, color: colors.bloodReel },

  // Critique Input — Web: AnnotationPanel "File an enduring critique..."
  critiqueInputWrap: { 
    marginTop: 32, paddingTop: 24, 
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.15)',
  },
  critiqueInput: {
    backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 2, paddingHorizontal: 16, paddingVertical: 16,
    color: colors.parchment, fontFamily: fonts.body, fontSize: 14, lineHeight: 22,
    minHeight: 80, textAlignVertical: 'top',
  },
  critiqueSubmitBtn: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.sepia, borderRadius: 2, 
    paddingVertical: 14, marginTop: 12, 
  },
  critiqueSubmitText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 2, color: colors.ink },
  
  backBtnRow: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.ash, borderRadius: 2 },
  backBtnText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2, color: colors.bone },
});
