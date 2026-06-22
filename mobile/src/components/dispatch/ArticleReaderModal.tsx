import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Edit3, ExternalLink, Eye, Heart, MessageSquare, Share2, Sparkles, Trash2, X as XIcon } from 'lucide-react-native';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Share, Text, View } from 'react-native';
import { safeOpenURL } from '@/src/utils/linking';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { Dossier, useDispatchStore } from '@/src/stores/content';
import { colors } from '@/src/theme/theme';
import { isNetworkError } from '@/src/utils/networkError';
import { enqueueMutation, flushOfflineQueue, getOfflineQueue } from '@/src/utils/offlineQueue';
import reelToast from '@/src/utils/reelToast';

import { markdownStyles, st } from './styles';
import { WireStory } from './types';

export const ArticleReaderModal = memo(function ArticleReaderModal({
  article,
  visible,
  onClose,
}: {
  article: Dossier | WireStory | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [certified, setCertified] = useState(false);
  const [certifyCount, setCertifyCount] = useState(0);
  const [localViews, setLocalViews] = useState(0);
  const [isCertifying, setIsCertifying] = useState(false);
  const [localArticle, setLocalArticle] = useState<Dossier | WireStory | null>(article);
  const activeArticleIdRef = useRef<string | null>(null);
  const router = useRouter();
  const isMountedRef = useRef(true);
  const isClosingRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const globalDossiers = useDispatchStore(s => s.dossiers);

  useEffect(() => {
    if (article) setLocalArticle(article);
  }, [article]);

  // Re-bind to the live global state engine to instantly pick up background offline syncs
  const displayArticle = useMemo(() => {
    const base = article || localArticle;
    if (!base) return null;
    if ('certifyCount' in base) {
      return globalDossiers.find(d => d.id === base.id) ?? base;
    }
    return base;
  }, [article, localArticle, globalDossiers]);

  // EFFECT 1: Strict Initialization & View Increment
  useEffect(() => {
    if (!visible || !article) {
      activeArticleIdRef.current = null;
      return;
    }

    isClosingRef.current = false;
    setIsDeleting(false);

    const isDossier = 'authorId' in article;
    const targetId = article.id;

    if (activeArticleIdRef.current === targetId) {
      return; // Already initialized for this open session
    }

    activeArticleIdRef.current = targetId;
    const dispatchStore = useDispatchStore.getState();

    // Isolate UI states for new article
    setCertifyCount(article.certifyCount ?? 0);
    setLocalViews(article.views ?? 0);
    setIsCertifying(false);

    if (isDossier && targetId && !targetId.startsWith('seed-') && !targetId.startsWith('fb')) {
      const isCertifiedByMe = dispatchStore.certifiedDossierIds.has(targetId);
      setCertified(isCertifiedByMe);
      
      // Optimistic global update for views instantly, ONLY if not viewed in this session
      if (dispatchStore.markDossierViewed(targetId)) {
        setLocalViews(prev => prev + 1);
        dispatchStore.syncDossierStats(targetId, 1, 0);

        supabase.rpc('increment_dossier_views', { dossier_uuid: targetId }).then(({ error }) => {
          if (error) {
            if (isNetworkError(error)) {
                enqueueMutation({ type: 'increment_dossier_views', payload: { dossier_uuid: targetId } });
                flushOfflineQueue();
            } else {
                if (isMountedRef.current && activeArticleIdRef.current === targetId) {
                  setLocalViews(prev => Math.max(0, prev - 1));
                }
                useDispatchStore.getState().syncDossierStats(targetId, -1, 0);
                useDispatchStore.getState().unmarkDossierViewed(targetId);
            }
          }
        });
      }
    } else {
      setCertified(false);
    }
  }, [article, visible]);

  const handleCertify = async () => {
    const isDossier = displayArticle && 'authorId' in displayArticle;
    if (!user) {
      reelToast.info('Log in to certify dossiers.');
      return;
    }
    if (!displayArticle?.id || !isDossier) return;
    if (displayArticle.id.startsWith('seed-') || displayArticle.id.startsWith('fb')) {
      reelToast.info('Archival dossiers cannot be certified.');
      return;
    }
    if (isCertifying || isClosingRef.current || isDeleting) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCertifying(true);

    const targetId = displayArticle.id;
    const wasCertified = certified;
    const certifyDelta = wasCertified ? -1 : 1;

    setCertified(!wasCertified);
    setCertifyCount((prev) => Math.max(0, prev + certifyDelta));
    useDispatchStore.getState().syncDossierStats(targetId, 0, certifyDelta, !wasCertified);

    try {
      const { data, error } = await supabase.rpc('toggle_dossier_certify', { dossier_uuid: targetId });
      if (error) throw error;
      if ((!!data) !== (!wasCertified)) {
        useDispatchStore.getState().syncDossierStats(targetId, 0, -certifyDelta, !!data);
        if (isMountedRef.current && activeArticleIdRef.current === targetId) {
          setCertified(!!data);
          setCertifyCount((prev) => Math.max(0, prev - certifyDelta));
        }
      }
    } catch (e: any) {
      if (isNetworkError(e)) {
          enqueueMutation({
              type: 'toggle_dossier_certify',
              payload: { dossier_uuid: targetId, desired_state: !wasCertified }
          });
          flushOfflineQueue();
          reelToast.success('Certification queued offline.');
      } else {
          if (__DEV__) console.error('[ArticleReaderModal] Certify error:', e);
          if (isMountedRef.current && activeArticleIdRef.current === targetId) {
            setCertified(wasCertified);
            setCertifyCount((prev) => Math.max(0, prev - certifyDelta));
          }
          useDispatchStore.getState().syncDossierStats(targetId, 0, -certifyDelta, wasCertified);
      }
    } finally {
      if (isMountedRef.current && activeArticleIdRef.current === targetId) setIsCertifying(false);
    }
  };

  const handleShare = async () => {
    if (!displayArticle || isClosingRef.current || isDeleting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    let url = '';
    const isDossier = 'authorId' in displayArticle;
    if (isDossier && displayArticle.id && !displayArticle.id.startsWith('seed-') && !displayArticle.id.startsWith('fb')) {
      const isOffline = getOfflineQueue().some(m => m.type === 'add_dossier' && m.payload._tempId === displayArticle.id);
      if (isOffline) {
        reelToast.info('Cannot share a dossier while it is queued offline.');
        return;
      }
      url = `https://reelhouse.app/dossier/${displayArticle.id}`;
    } else if ('link' in displayArticle && (displayArticle as WireStory).link) {
      url = (displayArticle as WireStory).link || '';
    }
    
    const text = `"${displayArticle.title}" — a dispatch on The ReelHouse Society.`;
    try {
      const shareOptions: import('react-native').ShareContent = url 
        ? { message: `${text}\n${url}`, url }
        : { message: text };

      await Share.share(shareOptions);
    } catch (e: unknown) {
      if (__DEV__) console.error('[ArticleReaderModal] Share error:', e);
    }
  };

  const isDossier = displayArticle && 'authorId' in displayArticle;
  const isAuthor = isDossier && user?.id === (displayArticle as Dossier).authorId;

  const handleEdit = () => {
    if (!displayArticle || !isDossier || isClosingRef.current || isDeleting) return;
    if (displayArticle.id.startsWith('seed-') || displayArticle.id.startsWith('fb')) {
      reelToast.info('Archival dossiers cannot be altered.');
      return;
    }
    isClosingRef.current = true;
    onClose();
    setTimeout(() => {
      (router.push as any)({
        pathname: '/dispatch/compose',
        params: { 
          edit: displayArticle.id,
          initialTitle: (displayArticle as Dossier).title,
          initialContent: (displayArticle as Dossier).fullContent || (displayArticle as Dossier).excerpt || '',
        }
      } as any);
    }, 350);
  };

  const handleDelete = () => {
    if (!displayArticle || !isDossier || isClosingRef.current || isDeleting) return;
    if (displayArticle.id.startsWith('seed-') || displayArticle.id.startsWith('fb')) {
      reelToast.info('Archival dossiers cannot be altered.');
      return;
    }
    Alert.alert(
      'DELETE DOSSIER',
      'This action is permanent and cannot be undone. Burn this dossier?',
      [
        { text: 'CANCEL', style: 'cancel' },
        { 
          text: 'BURN', 
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await useDispatchStore.getState().deleteDossier(displayArticle.id);
              reelToast.success('Dossier burned');
              isClosingRef.current = true;
              onClose();
            } catch (e: unknown) {
              if (__DEV__) console.error('[ArticleReaderModal] Delete error:', e);
              reelToast.error('Failed to delete dossier');
              if (isMountedRef.current) setIsDeleting(false);
            }
          }
        }
      ]
    );
  };

  if (!displayArticle) return null;

  const isContentDossier = displayArticle && 'authorId' in displayArticle;
  const content = isContentDossier 
    ? ((displayArticle as Dossier).fullContent || (displayArticle as Dossier).excerpt || '')
    : ((displayArticle as WireStory).body || (displayArticle as WireStory).excerpt || '');

  return (
    <Modal 
      visible={visible} 
      animationType="fade" 
      transparent 
      statusBarTranslucent
      onRequestClose={() => {
        if (isClosingRef.current || isDeleting) return;
        isClosingRef.current = true;
        onClose();
      }}
    >
      <View style={st.readerOverlay}>
        {/* Close button - AT ABSOLUTE ROOT TO PREVENT SCROLLAWAY ENTRAPMENT */}
        <PressableScale style={[st.readerClose, { top: insets.top + 16 }]} onPress={() => {
          if (isClosingRef.current || isDeleting) return;
          isClosingRef.current = true;
          onClose();
        }} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel="Close article" haptic="medium">
          <XIcon size={20} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>

        <ScrollView
          style={st.readerScroll}
          contentContainerStyle={[st.readerScrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
        >

          {/* Watermark & Category */}
          <View style={{ marginBottom: 28, alignItems: 'center' }}>
            <Text style={[st.readerWatermark, { marginBottom: 0 }]}>
              {isContentDossier ? 'REELHOUSE DIGITAL DOSSIER' : 'GLOBAL WIRE TRANSMISSION'}
            </Text>
            {!isContentDossier && 'category' in displayArticle && displayArticle.category && (
              <Text style={[st.readerWatermark, { marginBottom: 0, marginTop: 8, color: colors.sepia, opacity: 0.9 }]}>
                [{displayArticle.category}]
              </Text>
            )}
          </View>

          {/* Title */}
          <Text style={st.readerTitle}>{displayArticle.title}</Text>

          {/* Byline */}
          {displayArticle.author && (
            <Text style={st.readerByline}>
                <Text 
                style={isDossier && (displayArticle as Dossier).authorId ? st.readerBylineAuthor : undefined}
                onPress={isDossier && (displayArticle as Dossier).authorId ? () => {
                  if (isClosingRef.current || isDeleting) return;
                  const d = displayArticle as Dossier;
                  if (d.authorId) {
                    isClosingRef.current = true;
                    onClose();
                    setTimeout(() => {
                      (router.push as any)(`/user/${d.authorUsername ? d.authorUsername : d.authorId}` as any);
                    }, 350);
                  }
                } : undefined}
              >
                {'authorUsername' in displayArticle && (displayArticle as Dossier | WireStory).authorUsername ? `@${(displayArticle as Dossier | WireStory).authorUsername}` : displayArticle.author}
              </Text>
              {displayArticle.date ? `  ·  ${displayArticle.date}` : ''}
            </Text>
          )}

          {/* Engagement stats */}
          {isDossier && (
            <View style={st.readerStats}>
              <View style={st.readerStatRow}>
                <Eye size={10} color={colors.fog} strokeWidth={1.5} />
                <Text style={st.readerStatText}>{localViews} VIEWS</Text>
              </View>
              <View style={st.readerStatRow}>
                <Sparkles size={10} color={certified ? colors.sepia : colors.fog} strokeWidth={1.5} />
                <Text style={[st.readerStatText, certified && st.readerStatCertified]}>
                  {certifyCount} CERTIFIED
                </Text>
              </View>
            </View>
          )}

          {/* Separator */}
          <View style={st.readerSep} />

          {/* Body content */}
          <Markdown style={markdownStyles}>
            {content}
          </Markdown>

          {/* Action bar */}
          {isDossier && (
            <View style={st.readerActions}>
              <PressableScale style={st.readerActionBtn} onPress={handleCertify} pressedScale={0.95} haptic>
                <Heart size={14} color={certified ? colors.sepia : colors.fog} strokeWidth={1.5} fill={certified ? colors.sepia : 'transparent'} />
                <Text style={[st.readerActionText, certified && st.readerActionCertified]} numberOfLines={1}>
                  {certified ? 'CERTIFIED' : 'CERTIFY'} ({certifyCount})
                </Text>
              </PressableScale>

              <PressableScale style={st.readerActionBtn} onPress={handleShare} pressedScale={0.95} haptic>
                <Share2 size={14} color={colors.fog} strokeWidth={1.5} />
                <Text style={st.readerActionText} numberOfLines={1}>SHARE</Text>
              </PressableScale>

              <PressableScale style={st.readerActionBtn} onPress={() => {
                if (isClosingRef.current || isDeleting) return;
                isClosingRef.current = true;
                onClose();
                setTimeout(() => {
                  (router.push as any)(`/dossier/${displayArticle.id}` as any);
                }, 350);
              }} pressedScale={0.95} haptic>
                <MessageSquare size={14} color={colors.fog} strokeWidth={1.5} />
                <Text style={st.readerActionText} numberOfLines={1}>ANNOTATIONS</Text>
              </PressableScale>

              {isAuthor && (
                <>
                  <PressableScale style={st.readerActionBtn} onPress={handleEdit} pressedScale={0.95} haptic>
                    <Edit3 size={14} color={colors.fog} strokeWidth={1.5} />
                    <Text style={st.readerActionText} numberOfLines={1}>EDIT</Text>
                  </PressableScale>
                  
                  <PressableScale style={st.readerActionBtn} onPress={handleDelete} pressedScale={0.95} haptic>
                    <Trash2 size={14} color={colors.bloodReel} strokeWidth={1.5} />
                    <Text style={[st.readerActionText, { color: colors.bloodReel }]} numberOfLines={1}>DELETE</Text>
                  </PressableScale>
                </>
              )}
            </View>
          )}

          {/* If it's a wire story with a link */}
          {'link' in displayArticle && (displayArticle as WireStory).link && (
            <PressableScale
              style={st.wireReadFullBtn}
              onPress={() => { void safeOpenURL((displayArticle as WireStory).link!); }}
              pressedScale={0.97}
            >
              <View style={st.wireReadFullRow}>
                <ExternalLink size={12} color={colors.sepia} strokeWidth={1.5} />
                <Text style={st.wireReadFullText} numberOfLines={1}>READ FULL ARTICLE</Text>
              </View>
            </PressableScale>
          )}

          {/* End mark */}
          <View style={st.readerEndmarkRow}>
            <View style={st.readerEndmarkLine} />
            <Sparkles size={10} color={colors.sepia} strokeWidth={1.5} />
            <View style={st.readerEndmarkLine} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
});
