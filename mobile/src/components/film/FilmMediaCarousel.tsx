import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Play } from 'lucide-react-native';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';

interface VideoResult {
  key: string;
  name?: string;
  type: string;
}

interface VideoThumbProps {
  video: VideoResult;
  onPlay: (key: string) => void;
}

const VideoThumb = memo(function VideoThumb({ video, onPlay }: VideoThumbProps) {
  const thumb = tmdb.youtubeThumbnail(video.key);
  const handlePlay = useCallback(() => {
    TactileEngine.selection();
    onPlay(video.key);
  }, [onPlay, video.key]);

  return (
    <PressableScale onPress={handlePlay} style={sub.videoThumb} hitSlop={{top: 10, bottom: 10}} accessibilityLabel="Play video">
      <Image source={{ uri: thumb }} style={sub.videoImg} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      <View style={sub.videoPlayOverlay}>
        <View style={sub.videoPlayCircle}>
          <Play size={14} color={colors.parchment} fill={colors.parchment} />
        </View>
      </View>
      <View style={sub.videoLabelWrap}>
        <Text style={sub.videoType}>{video.type?.toUpperCase() ?? 'VIDEO'}</Text>
        <Text style={sub.videoName} numberOfLines={1}>{video.name}</Text>
      </View>
    </PressableScale>
  );
});

interface FilmMediaCarouselProps {
  videos: VideoResult[];
  onPlayVideo: (key: string) => void;
}
const keyExtractor = (item: VideoResult, index: number) => `${item.key}-${index}`;

export const FilmMediaCarousel = memo(function FilmMediaCarousel({ videos, onPlayVideo }: FilmMediaCarouselProps) {
  const renderVideoItem = useCallback(({ item }: { item: VideoResult }) => (
    <VideoThumb video={item} onPlay={onPlayVideo} />
  ), [onPlayVideo]);

  if (!videos || videos.length === 0) return null;

  return (
    <SectionErrorBoundary fallbackMessage="Media could not be loaded.">
      <Animated.View style={s.sectionFlush}>
        <View style={s.sectionPadded}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>VIDEOS ({videos.length})</Text>
            <View style={s.sectionLine} />
          </View>
        </View>
        <View style={sub.videoListContainer}>
          <FlashList
            data={videos.slice(0, 6)}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={keyExtractor}
            contentContainerStyle={s.horizontalList}
            estimatedItemSize={210}
            snapToInterval={210}
            snapToAlignment="start"
            decelerationRate="fast"
            renderItem={renderVideoItem}
          />
        </View>
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  sectionFlush: { marginBottom: 24, zIndex: 2 },
  sectionPadded: { paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  sectionTitle: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,105,20,0.3)' },
  horizontalList: { paddingHorizontal: 20 },
});

const sub = StyleSheet.create({
  videoListContainer: { height: 160 },
  videoThumb: { width: 200, marginRight: 10 },
  videoImg: { width: 200, height: 112, borderRadius: 4, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)' },
  videoPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 48, justifyContent: 'center', alignItems: 'center' },
  videoPlayCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(8,6,4,0.6)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.5)', justifyContent: 'center', alignItems: 'center' },
  videoLabelWrap: { marginTop: 8 },
  videoType: { fontFamily: fonts.uiBold, fontSize: 8, letterSpacing: 1.5, color: colors.sepia, marginBottom: 2 },
  videoName: { fontFamily: fonts.body, fontSize: 11, color: colors.bone },
});
