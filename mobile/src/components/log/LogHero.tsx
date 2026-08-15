
import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Film as FilmIcon, X } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { UserAttributionRow } from '@/src/components/feed/UserAttributionRow';
import { s } from '@/src/components/log/logDetailStyles';
import { formatFiledDate, hasPhysicalFormat } from '@/src/components/log/logRecord';
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
  /**
   * What the filing mark actually has to say. Every entry is conditional, so a
   * log with nothing recorded produces no band rather than an empty rule.
   *
   * NO_FORMAT guards the composer's 'None' option. The save path already drops
   * it (`physicalMedia !== 'None' ? … : null`) but the offline mapping in
   * app/log/[id].tsx passes the raw local value straight through — so the same
   * log printed "FORMAT: NONE" when read from the local store and nothing when
   * read from the server. That mapping is fixed too; this guard is what keeps
   * legacy rows and any future path from re-introducing it.
   */
  const filed = React.useMemo(() => {
    const out: { key: string; value: string; accent?: boolean }[] = [];
    if (log.watched_date) out.push({ key: 'date', value: formatFiledDate(log.watched_date) });
    if (log.watched_with) out.push({ key: 'with', value: `WITH ${log.watched_with.toUpperCase()}`, accent: true });
    if (hasPhysicalFormat(log.physical_media)) {
      out.push({ key: 'format', value: log.physical_media!.toUpperCase() });
    }
    return out;
  }, [log.watched_date, log.watched_with, log.physical_media]);

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
        {log.year && <Text style={s.logFilmYear}>{log.year}</Text>}
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
