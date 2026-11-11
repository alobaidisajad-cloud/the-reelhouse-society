/**
 * The Darkroom's prints. A print is a poster on the contact sheet with its edge print beneath it:
 * its place on the sheet and its year, a tick when the member has logged the film, and SAVE.
 * Nothing is drawn on the poster. A film with no poster is an undeveloped plate (its title and
 * year where the picture would be); an artist is a portrait print, named on its edge. While a
 * sheet is developed, its prints are still tiles: nothing loops.
 */
import React, { useRef } from 'react';
import { RemoteImage } from '@/src/components/Picture';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { nav } from '@/src/utils/typedRouter';
import { askIn } from '@/src/utils/askIn';
import { Bookmark } from 'lucide-react-native';

import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { tmdb } from '@/src/lib/tmdb';
import { type DiscoverFilm } from '@/src/stores/discover';
import { useFilmStore } from '@/src/stores/films';
import { useAuthStore } from '@/src/stores/auth';
import PressableScale from '@/src/components/PressableScale';
import { UNINKED } from '@/src/theme/unready';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { PLATE, SHEET, plateTitleCeiling } from './sheet';

/** A film's year, from either date it may carry. */
const yearOf = (item: DiscoverFilm) => ((item as { release_date?: string; first_air_date?: string }).release_date
  || (item as { release_date?: string; first_air_date?: string }).first_air_date || '').slice(0, 4);

export const Print = React.memo(function Print({ item, place }: {
  item: DiscoverFilm;
  /** Its place among the sheet's films, from 1; an artist has none. */
  place: number | null;
}) {
  const isPerson = item.media_type === 'person';
  const isLogged = useFilmStore((s) => !isPerson && !!s._loggedIndex[item.id]);
  const isSaved = useFilmStore((s) => !isPerson && !!s._watchlistIndex[item.id]);
  const addToWatchlist = useFilmStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useFilmStore((s) => s.removeFromWatchlist);
  const isAuthenticated = useAuthStore((s) => !!s.user);
  // Not on the watchlist the phone holds, but the ledger not yet read: not known to be unsaved.
  // Pressing it is still right (a film already saved is said as saved), so only its ink waits.
  const saveUnknown = useFilmStore((s) => !isPerson && isAuthenticated && !s._watchlistIndex[item.id] && s.marksKnown !== 'held');

  const title = (isPerson ? item.name : item.title || item.name) || 'Untitled';
  const year = yearOf(item);
  const picturePath = isPerson ? item.profile_path : item.poster_path;
  const pictureUri = picturePath ? (isPerson ? tmdb.profile(picturePath, 'w185') : tmdb.poster(picturePath, 'w342')) : null;
  // Everything the edge print tells, said with the picture that opens it.
  const said = isPerson ? `${title}, artist` : [title, year || null, isLogged ? 'logged' : null].filter(Boolean).join(', ');
  const column = useColumnWidth();

  const saving = useRef(false);
  const toggleSave = async () => {
    if (!isAuthenticated) {
      askIn();
      return;
    }
    if (saving.current) return;
    saving.current = true;
    try {
      if (isSaved) await removeFromWatchlist(item.id);
      else await addToWatchlist({ id: item.id, title, poster_path: item.poster_path, release_date: item.release_date });
    } catch (e) {
      if (__DEV__) console.warn('[Print] Watchlist mutation failed:', e);
    } finally {
      saving.current = false;
    }
  };

  return (
    <View style={s.print}>
      <PressableScale testID="film-card" onPress={() => nav.push(isPerson ? `/person/${item.id}` : `/film/${item.id}`)} haptic hitSlop={null}
        style={[s.pic, !pictureUri && s.undeveloped]} accessibilityRole="button" accessibilityLabel={said}>
        {pictureUri ? (
          <RemoteImage uri={pictureUri} style={StyleSheet.absoluteFill} recyclingKey={`${item.media_type || 'movie'}-${item.id}`}
            placeholder={{ blurhash: SEPIA_HASH }} transition={300} contentFit="cover" fallback={null} />
        ) : (
          // An undeveloped plate: the mark, then the title and year a negative carries on its edge.
          <>
            <Text style={s.plateMark} {...UNSPOKEN}>✦</Text>
            <Text style={s.plateTitle} {...scaledTextProps} numberOfLines={4}
              maxFontSizeMultiplier={Math.min(scaledTextProps.maxFontSizeMultiplier, plateTitleCeiling(title.toUpperCase(), column))}>
              {title.toUpperCase()}
            </Text>
            {!!year && <Text style={s.plateYear} {...scaledTextProps}>{year}</Text>}
          </>
        )}
      </PressableScale>

      {isPerson ? (
        <View style={s.who} {...UNSPOKEN}>
          <Text style={s.whoName} {...scaledTextProps}>{title.toUpperCase()}</Text>
          <Text style={s.whoKind} {...scaledTextProps}>ARTIST</Text>
        </View>
      ) : (
        <View style={s.edge}>
          <View style={s.marks} {...UNSPOKEN}>
            <Text style={s.place} {...scaledTextProps}>{place}</Text>
            {!!year && <Text style={s.year} {...scaledTextProps}>{year}</Text>}
          </View>
          {isLogged ? <Text style={s.tick} {...UNSPOKEN} {...scaledTextProps}>✓</Text> : null}
          <PressableScale touch="commit" onPress={toggleSave} haptic="light" hitSlop={null} style={s.save}
            accessibilityRole="button" accessibilityState={{ selected: isSaved }}
            accessibilityLabel={isSaved ? `Save: ${title} is on your watchlist. Takes it off` : `Save ${title} to your watchlist`}>
            <Bookmark size={15} strokeWidth={2} color={isSaved ? colors.sepia : colors.bone} fill={isSaved ? colors.sepia : 'transparent'}
              strokeDasharray={saveUnknown ? UNINKED : undefined} />
          </PressableScale>
        </View>
      )}
    </View>
  );
});

/** A print while the sheet is developed: a still tile, and its edge's room. */
export const PrintTile = React.memo(function PrintTile() {
  return (
    <View style={s.print} {...UNSPOKEN}>
      <View style={[s.pic, s.tile]} />
      <View style={s.edge} />
    </View>
  );
});

export const DarkroomSuggestionRow = React.memo(({ item, first, onPress }: { item: DiscoverFilm; first: boolean; onPress: (item: DiscoverFilm) => void }) => {
  const isPerson = item.media_type === 'person';
  const imgPath = isPerson ? item.profile_path : item.poster_path;
  const imgUri = imgPath ? (isPerson ? tmdb.profile(imgPath, 'w185') : tmdb.poster(imgPath, 'w92')) : null;
  const kind = isPerson ? 'ARTIST' : `${item.release_date?.slice(0, 4) || 'TBA'} · FILM`;

  return (
    <PressableScale testID="darkroom-suggestion-row" style={[s.suggestion, !first && s.suggestionRuled]} onPress={() => onPress(item)}
      haptic="light" pressedScale={0.98} hitSlop={null}
      accessibilityRole="button" accessibilityLabel={isPerson ? `${item.name}, artist` : `${item.title}, ${item.release_date?.slice(0, 4) || 'TBA'}, film`}>
      <View style={isPerson ? s.thumbPerson : s.thumbFilm}>
        {imgUri ? (
          <RemoteImage uri={imgUri} style={StyleSheet.absoluteFill} recyclingKey={`${item.media_type || 'movie'}-${item.id}`}
            placeholder={{ blurhash: SEPIA_HASH }} transition={50} contentFit="cover" fallback={null} />
        ) : null}
      </View>
      <View style={s.suggestionWords}>
        <Text style={s.suggestionTitle} {...scaledTextProps} numberOfLines={2}>{isPerson ? item.name : item.title}</Text>
        <Text style={s.suggestionKind} {...scaledTextProps}>{kind}</Text>
      </View>
    </PressableScale>
  );
});

DarkroomSuggestionRow.displayName = 'DarkroomSuggestionRow';

const s = StyleSheet.create({
  print: { flex: 1, minWidth: 0 },
  pic: {
    // The plate before its picture: the house's own ground, a shade above the sheet (the well is a field's).
    aspectRatio: 2 / 3, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.ink,
    borderWidth: PLATE.border, borderColor: 'rgba(232,223,208,0.1)',
  },
  undeveloped: {
    borderStyle: 'dashed', borderColor: 'rgba(158,148,136,0.45)',
    alignItems: 'center', justifyContent: 'center', gap: 6, padding: PLATE.pad,
  },
  plateMark: { fontFamily: fonts.display, fontSize: 16, color: colors.sepia, includeFontPadding: false },
  plateTitle: { fontFamily: fonts.sub, fontSize: PLATE.size, lineHeight: 14, letterSpacing: PLATE.spacing, color: colors.bone, textAlign: 'center', includeFontPadding: false },
  plateYear: { fontFamily: fonts.sub, fontSize: 10, color: colors.fogQuiet, includeFontPadding: false },
  tile: { backgroundColor: colors.surfaceRaised, borderColor: 'transparent' },
  // The edge print: as tall as SAVE (SHEET.edge), its marks on the left, SAVE at its end.
  edge: { flexDirection: 'row', alignItems: 'center', minHeight: SHEET.edge },
  marks: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 },
  place: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.sepia, includeFontPadding: false },
  year: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog, includeFontPadding: false },
  tick: { fontFamily: fonts.sub, fontSize: 11, color: colors.sepia, includeFontPadding: false },
  // A commit, 48 by its own box, reaching into half the gutter and never into the next print.
  save: { width: SHEET.edge, height: SHEET.edge, marginRight: -SHEET.gutter / 2, alignItems: 'center', justifyContent: 'center' },
  who: { minHeight: SHEET.edge, justifyContent: 'center', paddingTop: 6, paddingBottom: 8, gap: 1 },
  whoName: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.parchment, includeFontPadding: false },
  whoKind: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog, includeFontPadding: false },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8 },
  suggestionRuled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: 'rgba(232,223,208,0.06)' },
  thumbFilm: { width: 24, height: 38, borderRadius: 2, overflow: 'hidden', backgroundColor: colors.soot },
  thumbPerson: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.soot },
  suggestionWords: { flex: 1, minWidth: 0 },
  suggestionTitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.parchment },
  suggestionKind: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.fog, marginTop: 3, includeFontPadding: false },
});
