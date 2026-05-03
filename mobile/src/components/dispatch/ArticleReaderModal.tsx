import { memo, useEffect, useState } from 'react';
import { View, Text, ScrollView, Modal, Share, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Eye, Heart, Sparkles, X as XIcon, Share2, Edit3, Trash2, ExternalLink } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';

import { colors } from '@/src/theme/theme';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatchStore, Dossier } from '@/src/stores/content';
import { supabase } from '@/src/lib/supabase';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';

import { WireStory } from './types';
import { st, markdownStyles } from './styles';

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
  const router = useRouter();

  useEffect(() => {
    if (!article || !visible) return;
    setCertified(false);
    setCertifyCount(article.certifyCount ?? 0);
    setLocalViews((article.views ?? 0) + 1);

    const isDossier = 'authorId' in article;

    // Increment views + check certify status (ONLY for native Dossiers)
    if (isDossier && article.id && !article.id.startsWith('seed-') && !article.id.startsWith('fb')) {
      supabase.rpc('increment_dossier_views', { dossier_uuid: article.id }).then(({ error }) => {
        if (!error) {
          useDispatchStore.getState().syncDossierStats(article.id, 1, 0);
        }
      });
      if (user) {
        supabase
          .from('dossier_certifications')
          .select('id')
          .eq('user_id', user.id)
          .eq('dossier_id', article.id)
          .maybeSingle()
          .then(({ data }) => setCertified(!!data));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id, visible]);

  const handleCertify = async () => {
    const isDossier = article && 'authorId' in article;
    if (!user || !article?.id || !isDossier || article.id.startsWith('seed-') || article.id.startsWith('fb')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const wasCertified = certified;
    setCertified(!wasCertified);
    setCertifyCount((prev) => wasCertified ? Math.max(0, prev - 1) : prev + 1);

    try {
      const { data, error } = await supabase.rpc('toggle_dossier_certify', { dossier_uuid: article.id });
      if (error) throw error;
      setCertified(!!data);
      useDispatchStore.getState().syncDossierStats(article.id, 0, wasCertified ? -1 : 1);
    } catch (e: unknown) {
      if (__DEV__) console.error('[ArticleReaderModal] Certify error:', e);
      setCertified(wasCertified);
      setCertifyCount((prev) => wasCertified ? prev + 1 : Math.max(0, prev - 1));
    }
  };

  const handleShare = async () => {
    if (!article) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    let url = '';
    const isDossier = 'authorId' in article;
    if (isDossier && article.id && !article.id.startsWith('seed-') && !article.id.startsWith('fb')) {
      url = `https://reelhouse.app/dispatch/${article.id}`;
    } else if ('link' in article && (article as WireStory).link) {
      url = (article as WireStory).link || '';
    }
    
    const text = `"${article.title}" — a dispatch on The ReelHouse Society.`;
    try {
      await Share.share({
        message: url ? `${text}\n${url}` : text,
        url: url // iOS
      });
    } catch (e: unknown) {
      if (__DEV__) console.error('[ArticleReaderModal] Share error:', e);
    }
  };

  const isDossier = article && 'authorId' in article;
  const isAuthor = isDossier && user?.id === (article as Dossier).authorId;

  const handleEdit = () => {
    if (!article || !isDossier) return;
    onClose();
    router.push({
      pathname: '/dispatch/compose',
      params: { 
        edit: article.id, 
        initialTitle: article.title, 
        initialContent: 'fullContent' in article ? article.fullContent : '' 
      }
    } as any);
  };

  const handleDelete = () => {
    if (!article || !isDossier) return;
    Alert.alert(
      'DELETE DOSSIER',
      'This action is permanent and cannot be undone. Burn this dossier?',
      [
        { text: 'CANCEL', style: 'cancel' },
        { 
          text: 'BURN', 
          style: 'destructive',
          onPress: async () => {
            try {
              await useDispatchStore.getState().deleteDossier(article.id);
              reelToast.success('Dossier burned');
              onClose();
            } catch (e: unknown) {
              if (__DEV__) console.error('[ArticleReaderModal] Delete error:', e);
              reelToast.error('Failed to delete dossier');
            }
          }
        }
      ]
    );
  };

  if (!article) return null;

  const content = article.fullContent ?? article.excerpt ?? (article as WireStory).body ?? '';

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={st.readerOverlay}>
        {/* Close button - AT ABSOLUTE ROOT TO PREVENT SCROLLAWAY ENTRAPMENT */}
        <PressableScale style={[st.readerClose, { top: insets.top + 16 }]} onPress={onClose} hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel="Close article" haptic="medium">
          <XIcon size={20} color={colors.sepia} strokeWidth={1.5} />
        </PressableScale>

        <ScrollView
          style={st.readerScroll}
          contentContainerStyle={[st.readerScrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
        >

          {/* Watermark */}
          <Text style={st.readerWatermark}>REELHOUSE DIGITAL DOSSIER</Text>

          {/* Title */}
          <Text style={st.readerTitle}>{article.title}</Text>

          {/* Byline */}
          {article.author && (
            <Text style={st.readerByline}>
              FILED BY <Text 
                style={st.readerBylineAuthor}
                onPress={() => {
                  const d = article as Dossier;
                  if (d.authorId) {
                    onClose();
                    router.push(`/user/${d.authorUsername ? d.authorUsername : d.authorId}` as any);
                  }
                }}
              >
                {'authorUsername' in article && (article as Dossier | WireStory).authorUsername ? `@${(article as Dossier | WireStory).authorUsername}` : article.author}
              </Text>
              {article.date ? `  ·  ${article.date}` : ''}
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
          {'link' in article && (article as WireStory).link && (
            <PressableScale
              style={st.wireReadFullBtn}
              onPress={() => { Linking.openURL((article as WireStory).link!); }}
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
