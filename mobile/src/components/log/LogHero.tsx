
import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Film as FilmIcon, X } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { UserAttributionRow } from '@/src/components/feed/UserAttributionRow';
import { s } from '@/src/components/log/logDetailStyles';
import { buildFilingMark } from '@/src/components/log/logRecord';
import { displayTextProps } from '@/src/constants/textScaling';

interface LogHeroProps {
  log: {
    film_id: number;
    film_title: string;
    year?: number | null;
    rating: number;
    status: string;
    abandoned_reason?: string | null;
    watched_date?: string | null;
    watched_with?: string | null;
    physical_media?: string | null;
    editorial_header?: string | null;
    alt_poster?: string | null;
    poster_path: string | null;
  };
  profile: {
    username: string;
    role?: string;
    avatar_url?: string | null;
  } | null;
  posterUri: string | null | undefined;
  isAuteur: boolean;
  isArchivist: boolean;
  timeAgo: string;
  onPosterLoaded: () => void;
  onPressUser: () => void;
  onPressFilm: () => void;
}

export default function LogHero({
  log,
  profile,
  posterUri,
  isAuteur,
  isArchivist,
  timeAgo,
  onPosterLoaded,
  onPressUser,
  onPressFilm,
}: LogHeroProps) {
  // What the filing mark has to say — see buildFilingMark, which owns the rules
  // for what counts as a printable fact (and is tested on the empty cases).
  //
  // The three fields are pulled out rather than depending on `log`, which would
  // rebuild the band every time anything else on the record changed. Written
  // this way the dependency list is the truth, instead of a shorter list with
  // the lint rule silenced over it.
  const { watched_date, watched_with, physical_media } = log;
  const filed = React.useMemo(
    () => buildFilingMark({ watched_date, watched_with, physical_media }),
    [watched_date, watched_with, physical_media],
  );

  return (
    <View style={s.logCenter}>
      {/* The ledger byline — the app's own handwriting: avatar · handle · crest · rule */}
      <View style={s.bylineFull}>
        <UserAttributionRow
          username={profile?.username || 'unknown'}
          avatarUrl={profile?.avatar_url}
          role={profile?.role}
          timeAgo={timeAgo}
          onUserPress={onPressUser}
        />
      </View>

      {/* CENTER: Poster plate — radial glow for premium ranks */}
      <View style={s.posterSection}>
        {(isAuteur || isArchivist) && posterUri && (
          <View style={[s.posterGlow, isAuteur ? s.posterGlowAuteur : s.posterGlowArchivist]} />
        )}
        <PressableScale onPress={onPressFilm} style={[s.posterBoundsShadow, isAuteur && s.posterBoundsShadowAuteur]} pressedScale={0.95} haptic="selection">
        <View style={[s.posterBounds, isAuteur && s.posterBoundsAuteur]}>
          {posterUri ? (
            <Image source={{ uri: posterUri }} style={s.posterCentered} contentFit="cover" cachePolicy="memory-disk" transition={150} onLoadEnd={onPosterLoaded} />
          ) : (
            <View style={[s.posterCentered, s.posterPlaceholder]}>
              <FilmIcon size={20} color={colors.sepia} strokeWidth={1} />
            </View>
          )}
        </View>
        </PressableScale>
      </View>

      {/* BOTTOM: Title & Meta */}
      <View style={s.titleSection}>
        <PressableScale onPress={onPressFilm} pressedScale={0.95} haptic="selection">
           <Text style={s.logFilmTitle} {...displayTextProps} adjustsFontSizeToFit numberOfLines={3} minimumFontScale={0.8}>{log.film_title}</Text>
        </PressableScale>
        {/* `!!` because a bare number in a && guard RENDERS when it is 0 — and a
            loose 0 outside a <Text> is a red screen, not a missing year. */}
        {!!log.year && <Text style={s.logFilmYear}>{log.year}</Text>}
      </View>

      {log.rating > 0 && (
        <View style={s.ratingWrap}>
          <ReelRating rating={log.rating} size={18} />
        </View>
      )}

      {log.status === 'abandoned' && (
        <View style={s.abandonedWrap}>
          <View style={s.abandonedBadge}>
            <X size={12} color={colors.crimson} strokeWidth={2} />
            <Text style={s.abandonedText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
               ABANDONED{log.abandoned_reason ? ` — ${log.abandoned_reason.toUpperCase()}` : ''}
            </Text>
          </View>
        </View>
      )}

      {/* ── THE FILING MARK ──
          Four centred captions used to stack here — watched, with, format —
          each on its own line, which reads as a tombstone rather than a record.
          This is one ruled band instead: a brass label and its values, the same
          grammar the feed card already speaks. The rules above and below are
          what make it read as something stamped into the file.

          `format` is only a fact when there IS one. 'None' is a selectable
          option in the composer and it is stored as that literal string, so it
          used to print "FORMAT: NONE" — a field announcing its own absence. */}
      {filed.length > 0 && (
         <View style={s.filingMark}>
            <Text style={s.filingLabel} {...displayTextProps}>FILED</Text>
            {filed.map((entry, i) => (
              <View key={entry.key} style={s.filingEntry}>
                {i > 0 && <Text style={s.filingDot}>·</Text>}
                <Text style={[s.filingValue, entry.accent && s.filingValueAccent]} {...displayTextProps}>
                  {entry.value}
                </Text>
              </View>
            ))}
         </View>
      )}
    </View>
  );
}
