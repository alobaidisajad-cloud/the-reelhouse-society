/**
 * ── THE THING THE WHOLE AUTEUR TIER IS FOR ───────────────────────────────────
 * A dossier may run to twenty-five thousand words and I had drawn it exactly
 * twice: as a card in the feed, and as a card on a profile. The essay being
 * READ — the entire reason an Auteur pays — did not exist as a design.
 *
 * That is the largest gap in the set, and it is the one screen here that is
 * allowed to stop being a newspaper. A letters page is set tight because
 * entries are short and many; an essay is one long voice, and the page has to
 * get out of its way:
 *
 *   · NO MARGIN COLUMN. There is no ordering value to print — there is one
 *     entry. The hour, the rule and the 59pt indent all go, and the text takes
 *     the full measure.
 *   · ONE SERIF, SET LARGE. 16.5/28 Spectral. The feed's 13pt body is right for
 *     a paragraph and punishing for four thousand words.
 *   · THE DROP CAP EARNS ITSELF HERE. In a feed card it was an ornament on a
 *     headline; on an essay it is what it has always been — the mark that says
 *     the reading starts now.
 *   · A PRINTED SECTION BREAK, not a heading. The ornament already in the set.
 *
 * Everything else is the app: the same byline, the same brass, the same docked
 * marks, the same spine when the head scrolls away.
 */
import { memo, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, decorativeTextProps, displayTextProps } from '@/src/constants/textScaling';
import { p, QUIET } from './paperStyles';
import { KIND_RULE, UNSPOKEN } from './paperMetrics';
import { softBreak } from './paperText';
import { Byline, Credit, type PaperAuthor, type PaperFilm } from './PaperPost';

export const EssayHead = memo(function EssayHead({
  title, series, author, readTime, filed, film, onSeries, onAuthor, onFilm,
}: {
  title: string; series?: string; author: PaperAuthor;
  readTime: string; filed: string; film?: PaperFilm | null;
  onSeries?: () => void; onAuthor?: () => void; onFilm?: () => void;
}) {
  return (
    <View>
      {film?.backdropPath ? (
        <View style={e.cover}>
          <Image source={{ uri: film.backdropPath }} style={p.plateArt} contentFit="cover"
            recyclingKey={film.backdropPath} cachePolicy="memory-disk" />
          <LinearGradient
            colors={['rgba(26,17,7,0.30)', 'rgba(14,10,5,0.72)', 'rgba(8,6,4,0.99)']}
            locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      {/* The kind names itself here as it does everywhere — but as its own line
          above the title, not inline. At 26pt Rye an inline 10pt label reads as
          a mistake rather than as a code. */}
      <Text style={[p.leadIn, { color: KIND_RULE.dossier, marginTop: film?.backdropPath ? -6 : 18 }]}
        {...decorativeTextProps}>
        DOSSIER
      </Text>
      <Text style={e.title} accessibilityRole="header" {...displayTextProps}>{title}</Text>

      {series ? (
        <PressableScale style={e.seriesRow} haptic="selection" onPress={onSeries}
          accessibilityRole="button" accessibilityLabel={`${series}. Open the series.`}>
          <Text style={e.series} numberOfLines={1} {...scaledTextProps}>{series.toUpperCase()}</Text>
          <ChevronRight size={12} strokeWidth={2} color={colors.sepia} />
        </PressableScale>
      ) : null}

      <View style={e.bylineRow}>
        <Byline author={author} onPress={onAuthor} trailing={`${readTime} · ${filed}`} />
      </View>
      {film ? <View style={{ marginTop: 4 }}><Credit film={film} onPress={onFilm} /></View> : null}
      <View style={[p.hair, { marginTop: 16, marginBottom: 16 }]} />
    </View>
  );
});

/** The opening paragraph, with the cap. Only the first — a drop cap on every
 *  section is a pattern book, not a page. */
export const EssayOpening = memo(function EssayOpening({ text }: { text: string }) {
  const cap = text.slice(0, 1);
  return (
    <View style={e.openRow}>
      <Text style={e.cap} {...decorativeTextProps}>{cap}</Text>
      {/* `bodyFlex` ONLY here. This paragraph sits beside the cap in a row and
          needs the remaining width; every other paragraph is a block in a
          column, where `flex: 1` makes each one claim the leftover height and
          they stack on top of each other. That is exactly what happened. */}
      <Text style={[e.body, e.bodyFlex]} {...scaledTextProps}>{softBreak(text.slice(1))}</Text>
    </View>
  );
});

export const EssayPara = memo(function EssayPara({ children }: { children: ReactNode }) {
  return <Text style={[e.body, { marginTop: 16 }]} {...scaledTextProps}>{children}</Text>;
});

export const EssayBreak = memo(function EssayBreak() {
  return (
    <View style={e.breakRow}>
      <View style={e.breakLine} />
      <Text style={e.breakMark} {...decorativeTextProps} {...UNSPOKEN}>✦</Text>
      <View style={e.breakLine} />
    </View>
  );
});

/** The foot of a part: what comes next, by name. An essay in four parts that
 *  ends with nothing is an essay the reader has to go and hunt for. */
export const EssayNext = memo(function EssayNext({
  label, title, readTime, onPress,
}: { label: string; title: string; readTime: string; onPress?: () => void }) {
  return (
    <PressableScale style={e.next} haptic="medium" onPress={onPress}
      accessibilityRole="button" accessibilityLabel={`${label}. ${title}. ${readTime}.`}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={e.nextLabel} {...decorativeTextProps}>{label}</Text>
        <Text style={e.nextTitle} numberOfLines={2} {...displayTextProps}>{title}</Text>
        <Text style={e.nextMeta} {...scaledTextProps}>{readTime}</Text>
      </View>
      <ChevronRight size={16} strokeWidth={2} color={colors.sepia} />
    </PressableScale>
  );
});

/**
 * ── THE SERIES ───────────────────────────────────────────────────────────────
 * "Part II of Ozu, in four parts" was a line on a card that pointed at a page
 * that did not exist. It exists now, and it is the letters page again: the part
 * number in the margin, the part in the column.
 *
 * Parts not yet written are LISTED, dimmed, saying TO COME. A series that only
 * shows what is finished tells a reader nothing about what they are starting.
 */
export interface Part {
  n: string; title: string; readTime?: string; certified?: number;
  current?: boolean; toCome?: boolean;
}

export const SeriesList = memo(function SeriesList({
  title, author, parts, onPart, onAuthor,
}: {
  title: string; author: PaperAuthor; parts: Part[];
  /** A part that is not yet written has nowhere to go, and says so instead. */
  onPart?: (part: Part) => void;
  onAuthor?: () => void;
}) {
  const done = parts.filter((x) => !x.toCome).length;
  return (
    <View>
      <Text style={e.seriesTitle} accessibilityRole="header" {...displayTextProps}>{title}</Text>
      <View style={e.seriesMetaRow}>
        <Byline author={author} onPress={onAuthor} />
        <Text style={e.seriesCount} {...decorativeTextProps}>
          {done} OF {parts.length}
        </Text>
      </View>
      <View style={[p.hair, { marginTop: 12 }]} />

      {parts.map((x, i) => (
        <View key={x.n}>
          {i > 0 && <View style={p.hair} />}
          <PressableScale
            style={[e.part, x.toCome && { opacity: 0.78 }]}
            onPress={() => onPart?.(x)}
            disabled={x.toCome} haptic="selection" hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!x.toCome, selected: !!x.current }}
            accessibilityLabel={x.toCome ? `Part ${x.n}. ${x.title}. To come.` : `Part ${x.n}. ${x.title}.`}
          >
            <View style={p.margin}>
              <Text style={p.marginValue} {...decorativeTextProps}>{x.n}</Text>
            </View>
            <View style={[p.column, x.current && { borderLeftColor: KIND_RULE.dossier }]}>
              <Text style={e.partTitle} numberOfLines={2} {...displayTextProps}>{x.title}</Text>
              <Text style={e.partMeta} numberOfLines={1} {...scaledTextProps}>
                {x.toCome
                  ? 'TO COME'
                  : [x.readTime, x.certified ? `${x.certified} CERTIFIED` : null,
                     x.current ? 'YOU ARE HERE' : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </PressableScale>
        </View>
      ))}
    </View>
  );
});

const e = StyleSheet.create({
  /** Full-bleed sideways only. A negative TOP margin pulled it up over the back
   *  bar, because the sheet has no top padding to eat into. */
  cover: {
    height: 176, marginHorizontal: -24, marginBottom: 16,
    overflow: 'hidden', backgroundColor: 'rgba(20,16,11,0.9)',
  },
  /** 26/33, and the only place Rye is set this large outside the masthead. */
  title: {
    fontFamily: fonts.display, fontSize: 26, lineHeight: 34,
    color: colors.parchment, marginTop: 8,
  },
  seriesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 4 },
  series: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.6, color: colors.sepia,
    includeFontPadding: false, flexShrink: 1,
  },
  bylineRow: { marginTop: 12 },

  /** 16.5/28. The feed's 13pt is right for a paragraph and punishing for four
   *  thousand words; this is set for reading, not for scanning. */
  body: {
    fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 28,
    color: colors.parchment, opacity: 0.94,
  },
  bodyFlex: { flex: 1 },
  openRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cap: {
    fontFamily: fonts.display, fontSize: 52, lineHeight: 46,
    color: KIND_RULE.dossier, paddingRight: 8, marginTop: -4,
  },

  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24, opacity: 0.72 },
  breakLine: { flex: 1, height: 1, backgroundColor: colors.sepia },
  breakMark: { color: colors.sepia, fontSize: 10 },

  next: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.25)',
    paddingTop: 16, marginTop: 34, paddingBottom: 8,
  },
  nextLabel: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia,
    includeFontPadding: false, marginBottom: 8,
  },
  nextTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.parchment },
  nextMeta: {
    fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.2, color: colors.fog,
    marginTop: 6, includeFontPadding: false,
  },

  seriesTitle: {
    fontFamily: fonts.display, fontSize: 26, lineHeight: 34,
    color: colors.parchment, marginTop: 16,
  },
  seriesMetaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, marginTop: 12,
  },
  seriesCount: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 2.2, color: colors.sepia,
    includeFontPadding: false,
  },
  part: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
  partTitle: { fontFamily: fonts.display, fontSize: 16.5, lineHeight: 22, color: colors.parchment },
  partMeta: {
    fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1.6, color: colors.fog,
    marginTop: 8, includeFontPadding: false,
  },
});
