import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, Dimensions } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { ReelRating } from '@/src/components/Decorative';

const { width } = Dimensions.get('window');

interface ShareCardModalProps {
  visible: boolean;
  onClose: () => void;
  film: any;
  log?: any;
}

export function ShareCardModal({ visible, onClose, film, log }: ShareCardModalProps) {
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!viewShotRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      await Sharing.shareAsync(uri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share Cinematic Dossier',
      });
    } catch (err) {
      console.log('Share failed:', err);
    } finally {
      setSharing(false);
      onClose();
    }
  };

  if (!film) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        
        <View style={s.modalContent}>
          <View style={s.header}>
            <Text style={s.title}>GENERATE CLASSIFIED DOSSIER</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{top:10,right:10,bottom:10,left:10}}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* This is the card that we screenshot. It simulates the Web's Nitrate Noir export. */}
          <View style={s.cardWrapper}>
            <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 0.9 }} style={s.cardContainer}>
              {/* Backing gradient for the cinematic look */}
              <View style={StyleSheet.absoluteFill}>
                <Image 
                  source={{ uri: tmdb.backdrop(film.backdrop_path, 'w780') }} 
                  style={{ width: '100%', height: '100%', opacity: 0.15 }} 
                  blurRadius={10} 
                />
              </View>
              
              <View style={s.cardHeader}>
                <Text style={s.logoText}>REELHOUSE SOCIETY</Text>
                {log?.watchedDate && (
                  <Text style={s.dateText}>{new Date(log.watchedDate).toLocaleDateString()}</Text>
                )}
              </View>

              <View style={s.filmInfoRow}>
                {film.poster_path ? (
                  <Image source={{ uri: tmdb.poster(log?.altPoster || film.poster_path, 'w185') }} style={s.cardPoster} />
                ) : (
                  <View style={[s.cardPoster, { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center'}]}>
                    <Text style={{ fontFamily: fonts.ui, fontSize: 8, color: colors.fog }}>∅</Text>
                  </View>
                )}
                
                <View style={s.filmDetails}>
                  <Text style={s.filmTitle} numberOfLines={2}>{film.title}</Text>
                  <Text style={s.filmYear}>{film.release_date?.slice(0, 4)}</Text>
                  
                  {log && log.rating > 0 && (
                    <View style={s.ratingWrap}>
                      <ReelRating rating={log.rating} size={14} />
                    </View>
                  )}
                  {log && log.status === 'abandoned' && (
                    <View style={s.abandonedBadge}>
                      <Text style={s.abandonedText}>✕ ABANDONED</Text>
                    </View>
                  )}
                </View>
              </View>

              {log?.review ? (
                <View style={s.reviewContainer}>
                  <Text style={s.reviewText} numberOfLines={5}>"{log.review}"</Text>
                </View>
              ) : (
                <View style={s.synopsisContainer}>
                  <Text style={s.synopsisText} numberOfLines={4}>{film.overview}</Text>
                </View>
              )}
              
              <View style={s.cardFooter}>
                <Text style={s.footerLabel}>CLASSIFIED ARCHIVE RECORD</Text>
              </View>
            </ViewShot>
          </View>

          <TouchableOpacity style={s.shareButton} onPress={handleShare} disabled={sharing}>
            <Text style={s.shareButtonText}>
              {sharing ? 'TRANSMITTING...' : 'SHARE TO SOCIALS'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 3, 1, 0.9)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
    borderRadius: 8,
    padding: 16,
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.bone,
  },
  closeText: {
    fontFamily: fonts.ui,
    fontSize: 14,
    color: colors.fog,
  },
  cardWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  cardContainer: {
    width: width - 72,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.ash,
    borderRadius: 6,
    overflow: 'hidden',
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 8,
  },
  logoText: {
    fontFamily: fonts.display,
    fontSize: 12,
    color: colors.parchment,
    letterSpacing: 1,
  },
  dateText: {
    fontFamily: fonts.ui,
    fontSize: 8,
    color: colors.fog,
    letterSpacing: 1,
  },
  filmInfoRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  cardPoster: {
    width: 70,
    height: 105,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.2)',
  },
  filmDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  filmTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.bone,
    lineHeight: 26,
    marginBottom: 4,
  },
  filmYear: {
    fontFamily: fonts.ui,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.fog,
    marginBottom: 12,
  },
  ratingWrap: {
    alignSelf: 'flex-start',
  },
  abandonedBadge: {
    backgroundColor: 'rgba(162,36,36,0.1)',
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    alignSelf: 'flex-start',
  },
  abandonedText: {
    fontFamily: fonts.ui,
    fontSize: 8,
    color: colors.danger,
    letterSpacing: 1,
  },
  reviewContainer: {
    backgroundColor: 'rgba(196,150,26,0.05)',
    padding: 12,
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.sepia,
    marginBottom: 16,
  },
  reviewText: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    color: colors.parchment,
    lineHeight: 18,
  },
  synopsisContainer: {
    marginBottom: 16,
  },
  synopsisText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.bone,
    opacity: 0.7,
    lineHeight: 16,
  },
  cardFooter: {
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  footerLabel: {
    fontFamily: fonts.ui,
    fontSize: 6,
    letterSpacing: 3,
    color: colors.sepia,
    opacity: 0.8,
  },
  shareButton: {
    backgroundColor: colors.sepia,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  shareButtonText: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.ink,
  },
});
