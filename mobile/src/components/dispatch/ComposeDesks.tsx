/**
 * The four desks that are not the essay.
 * ─────────────────────────────────────────────────────────────────────────────
 * A take, a seeking and a wire share ONE desk, because they are one form: a
 * member, an hour, a sentence, and optionally a film. What differs is the
 * lead-in the paper prints and — for a wire — that a source is required, and the
 * desk already decides both from `kind`.
 *
 * A ballot has its own, because two to six films is a different shape.
 *
 * ── NO DRAFT PERSISTENCE HERE, DELIBERATELY ─────────────────────────────────
 * The dossier composer saves to MMKV because an essay is an evening's work and
 * must survive a background-kill. A take is a sentence. Restoring one three days
 * later into a desk somebody opened for something else is the app putting words
 * in their mouth — and the member cannot tell whether they wrote it or the app
 * did.
 *
 * ── A DESK WITH NOBODY AT IT ────────────────────────────────────────────────
 * Both desks used to end `if (!me) return null` — a screen that renders NOTHING.
 * Reachable: the brass Concierge is in the nav bar for everyone, "File to the
 * Dispatch" opens the picker, the picker offers all five forms to a signed-out
 * reader, and tapping one gave them an empty modal with no header, no back and
 * no sentence. Rendered and read back, the whole tree was `[]`.
 *
 * The dossier desk already answered this properly — it says why and takes them
 * back — so the other two now do the same thing rather than a third behaviour.
 * `sendBackIfNotAMember` is that one answer, written once.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import { PaperComposer } from '@/src/components/dispatch/paper/PaperComposer';
import { BallotDesk, FilmFinder } from '@/src/components/dispatch/paper/PaperDesk';
import type { PaperFilm } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { BALLOT_MIN, BALLOT_MAX } from '@/src/components/dispatch/paper/paperMetrics';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch } from '@/src/stores/dispatch';
import type { BallotOption } from '@/src/stores/dispatchTypes';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import reelToast from '@/src/utils/reelToast';

/** Set when the desk OPENS. A clock would re-render the composer every sixty
 *  seconds while somebody is typing, for a number nobody is watching. */
function useOpeningHour(): string {
  return useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);
}

/** The four facts a byline draws, for the member at the desk. */
function useMe() {
  const user = useAuthStore((s) => s.user);
  return useMemo(() => (user ? {
    name: user.username ?? '',
    memberNo: (user as { member_no?: number }).member_no ?? 0,
    tier: 'free' as const,
    avatar: (user as { avatar_url?: string | null }).avatar_url ?? null,
  } : null), [user]);
}

/**
 * Nobody is signed in, so there is nothing to file — say it and go back.
 *
 * The one answer for all three desks, taken from the one the dossier desk
 * already gave, down to the `isMounted` guard: this fires while the modal is
 * still animating in, and unguarded both pops land, so the member loses two
 * screens instead of one.
 *
 * A sentence and a way out, never `return null`. An empty screen is the worst
 * answer an app can give, because it tells the member nothing at all — not what
 * happened, not what to do, not even that anything happened.
 */
function useSendBackIfNotAMember(me: unknown) {
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);
  useEffect(() => {
    if (me) return;
    reelToast.error('Filing is for members.');
    InteractionManager.runAfterInteractions(() => {
      if (isMounted.current) router.back();
    });
  }, [me]);
}

// ── THE SHORT DESKS ─────────────────────────────────────────────────────────

export function ComposeShortScreen({ kind }: { kind: 'take' | 'seeking' | 'wire' }) {
  const me = useMe();
  useSendBackIfNotAMember(me);
  const insets = useSafeAreaInsets();
  const hour = useOpeningHour();

  /**
   * ── THE SAME DESK, AMENDING ─────────────────────────────────────────────
   * `?edit=<id>` opens this desk on a filing that already exists. It is the
   * same form deliberately: a member who has written a take once should not
   * have to learn a second screen to fix a word in it, and two desks for one
   * shape is how they drift apart.
   *
   * The filing is read from the store rather than fetched. Whatever route
   * reached this desk came through the reader, which has already hydrated it —
   * and if it somehow has not, `existing` is null, the fields open empty, and
   * `ready` refuses to file rather than overwriting a filing with nothing.
   */
  const editId = useLocalSearchParams<{ edit?: string }>().edit;
  /**
   * Read ONCE, through `getState`, not as a subscription.
   *
   * Every value below is a `useState` initialiser, which runs on the first
   * render and never again — so subscribing would buy nothing and cost a
   * re-render of the desk on every feed update while somebody is typing into
   * it. The filing is wherever the reader left it: on the page, or in the map
   * of what has been opened by its own address.
   */
  const existing = useMemo(
    () => {
      if (!editId) return null;
      const s = useDispatch.getState();
      return s.filings.find((f) => f.id === editId) ?? s.opened[editId] ?? null;
    },
    [editId],
  );
  const amending = !!editId && !!existing;

  const [body, setBody] = useState(() => (existing?.body ?? ''));
  /**
   * A wire's provenance, typed by the member.
   *
   * There was no such field. `source` was filled with the FILM's title, and the
   * desk required a film to make a wire fileable — so the picker's promise,
   * "News from elsewhere, carrying its source", produced a filing whose source
   * read `TOKYO STORY`, printed as the dateline beside the byline.
   */
  const [source, setSource] = useState(() => (existing?.source ?? ''));
  const [film, setFilm] = useState<PaperFilm | null>(() => existing?.film ?? null);
  const [filmId, setFilmId] = useState<number | null>(() => existing?.subjectId ?? null);
  const [spoiler, setSpoiler] = useState(() => !!existing?.spoilerLabel);
  const [finding, setFinding] = useState(false);
  const [sending, setSending] = useState(false);

  const remaining = MAX_LENGTHS.filingBody - body.length;

  /**
   * A wire carries its source or it is not a wire — the house rule, and the
   * database's `wire_source` CHECK, which refuses the row without one. So FILE
   * IT stays unlit until the film is named, rather than letting somebody write
   * a wire and be refused at the end by a constraint they cannot see.
   */
  const ready = body.trim().length > 0 && remaining >= 0
    && (kind !== 'wire' || source.trim().length > 0);

  const onFile = useCallback(async () => {
    if (!ready || sending) return;
    setSending(true);

    /**
     * ── AMENDING SENDS ONLY THE WORDS, NEVER THE FILM ──────────────────────
     * `amend` accepts a narrow set of fields and the SUBJECT is not among
     * them: the film a filing is about is what its critiques are arguing
     * about, and changing it under them turns forty replies into replies to
     * something else. A member who named the wrong film withdraws and files
     * again, which is the honest version of that change.
     *
     * So the picker stays on the desk while amending — it shows what the
     * filing is about — and the amendment carries the writing.
     */
    if (amending) {
      try {
        await useDispatch.getState().amend(editId!, {
          body: body.trim(),
          spoilerLabel: spoiler ? 'SPOILERS' : null,
          source: kind === 'wire' ? (source.trim() || null) : null,
        });
        reelToast.success('Amended');
        router.back();
      } catch {
        // The store put the old words back, and they are still in the field,
        // so nothing the member typed is lost by a refusal.
        reelToast.error('It could not be amended.');
      } finally {
        setSending(false);
      }
      return;
    }

    try {
      const filed = await useDispatch.getState().file({
        kind,
        body: body.trim(),
        spoilerLabel: spoiler ? 'SPOILERS' : null,
        // Where it came from, as the member wrote it — not the film's title,
        // which is already carried as the subject.
        source: kind === 'wire' ? (source.trim() || null) : null,
        film: film && filmId
          ? {
            id: filmId,
            title: film.title,
            sub: film.year ? String(film.year) : null,
            image: film.posterPath ?? null,
          }
          : null,
      });
      reelToast.success(filed?.offline ? 'Filed. It goes out when the wire is back.' : 'Filed');
      router.replace('/(tabs)/dispatch');
    } catch {
      reelToast.error('It could not be filed.');
    } finally {
      setSending(false);
    }
  }, [ready, sending, kind, body, spoiler, film, filmId, source, amending, editId]);

  // Sent back by the hook above; this render is the one frame before it lands.
  if (!me) return null;

  return (
    <View style={p.screen}>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <PaperComposer
        kind={kind}
        me={me}
        hour={hour}
        body={body}
        film={film}
        remaining={remaining}
        spoiler={spoiler}
        ready={ready}
        sending={sending}
        amending={amending}
        source={source}
        onSource={kind === 'wire' ? setSource : undefined}
        onBody={setBody}
        // BACK clears the KIND rather than leaving the modal, so a member who
        // picked WIRE by mistake is one tap from picking again instead of
        // dismissing the whole thing and starting over.
        onBack={() => router.setParams({ kind: '' })}
        onFile={onFile}
        onFilm={() => setFinding(true)}
        // A still belongs to a film. Offering it before one is named would be a
        // control that opens a picker with nothing to pick from.
        onStill={() => (film
          ? reelToast.success('The film’s own still is used.')
          : reelToast.error('Name a film first — the still comes with it.'))}
        onSpoiler={() => setSpoiler((s) => !s)}
      />
      <FilmPicker
        visible={finding}
        onClose={() => setFinding(false)}
        onPick={(f, id) => { setFilm(f); setFilmId(id); setFinding(false); }}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

// ── THE BALLOT DESK ─────────────────────────────────────────────────────────

export function ComposeBallotScreen() {
  const me = useMe();
  useSendBackIfNotAMember(me);
  const insets = useSafeAreaInsets();
  const hour = useOpeningHour();

  const [question, setQuestion] = useState('');
  // Six slots, drawn empty and numbered from the start, so the shape of the
  // thing being made is on the paper before it has been made.
  const [slots, setSlots] = useState<({ film: PaperFilm; id: number } | null)[]>(
    // ── THE BOUNDS ARE THE CONSTANTS, NOT SIX LITERAL NULLS ─────────────────
    // `BALLOT_MIN` and `BALLOT_MAX` existed and nothing used them: the slot
    // count was six hand-written nulls and the readiness test was `>= 2`. The
    // database's `ballot_options` CHECK enforces two-to-six, so moving either
    // number would have left the desk and the column disagreeing — the same
    // shape as the comment page size saying 30 while the query asked for 50.
    Array.from({ length: BALLOT_MAX }, () => null),
  );
  const [closes, setCloses] = useState('2 DAYS');
  const [finding, setFinding] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const filled = slots.filter(Boolean).length;
  const ready = filled >= BALLOT_MIN && question.trim().length > 0 && !sending;

  const onFile = useCallback(async () => {
    if (!ready) return;
    setSending(true);
    try {
      // Three choices, three real dates. The label is what the member reads;
      // the timestamp is what the ballot closes on — and `closes_at` is read at
      // RENDER time, so no scheduled job has to run for a ballot to close.
      const days = closes === '1 DAY' ? 1 : closes === '1 WEEK' ? 7 : 2;
      const closesAt = new Date(Date.now() + days * 86_400_000).toISOString();

      const options: BallotOption[] = slots
        .filter((s): s is { film: PaperFilm; id: number } => !!s)
        .map((s) => ({
          film_id: s.id,
          title: s.film.title,
          poster_path: s.film.posterPath ?? null,
        }));

      const filed = await useDispatch.getState().file({
        kind: 'ballot',
        title: question.trim(),
        // The question is the body too. `published_has_body` requires one, and
        // what the filing SAYS is the question — a ballot with a title and an
        // empty body would be a row the database refuses.
        body: question.trim(),
        options,
        closesAt,
      });
      reelToast.success(filed?.offline ? 'Filed. It goes out when the wire is back.' : 'The ballot is open');
      router.replace('/(tabs)/dispatch');
    } catch {
      reelToast.error('The ballot could not be opened.');
    } finally {
      setSending(false);
    }
  }, [ready, question, slots, closes]);

  // Sent back by the hook above; this render is the one frame before it lands.
  if (!me) return null;

  return (
    <View style={p.screen}>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <BallotDesk
        me={{ ...me, tier: 'auteur' }}
        hour={hour}
        question={question}
        onQuestion={setQuestion}
        options={slots.map((s) => s?.film ?? null)}
        closes={closes}
        ready={ready}
        onRemove={(i) => setSlots((prev) => prev.map((s, n) => (n === i ? null : s)))}
        onChoose={(i) => setFinding(i)}
        onCloses={setCloses}
        onBack={() => router.setParams({ kind: '' })}
        onFile={onFile}
      />
      <FilmPicker
        visible={finding !== null}
        onClose={() => setFinding(null)}
        onPick={(f, id) => {
          // ── THE SAME FILM CANNOT STAND TWICE ─────────────────────────────
          // Nothing stopped it. The ballot would have opened with `Tokyo Story`
          // in two slots, splitting its own vote between them and producing a
          // result that means nothing — and `ballot_options` only counts the
          // options, so the database would have accepted it.
          //
          // Refused with a word rather than silently ignored: a tap that does
          // nothing is the member wondering whether the app heard them.
          if (slots.some((s, n) => s?.id === id && n !== finding)) {
            reelToast.error('That film is already on this ballot.');
            return;
          }
          setSlots((prev) => prev.map((s, n) => (n === finding ? { film: f, id } : s)));
          setFinding(null);
        }}
        bottomInset={insets.bottom}
      />
    </View>
  );
}

// ── FIND A FILM ─────────────────────────────────────────────────────────────

/**
 * The one sheet the desks share.
 *
 * Searched against TMDB, the same source every other film field in this app
 * uses, so a film named here is the same film a log or a stack would have named
 * — one id, one poster, one title, everywhere.
 */
export function FilmPicker({
  visible, onClose, onPick, bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (film: PaperFilm, id: number) => void;
  bottomInset: number;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ film: PaperFilm; id: number }[]>([]);
  const seq = useRef(0);

  /**
   * Debounced, and the LAST request wins.
   *
   * Typing "the godfather" is thirteen keystrokes; without the delay that is
   * thirteen requests. And without the sequence number an early reply arriving
   * late would paint results for a query nobody is looking at any more — which
   * is how a member taps the wrong film without doing anything wrong.
   */
  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await tmdb.search(q);
        if (mine !== seq.current) return;
        setResults(
          ((res?.results ?? []) as unknown as Record<string, unknown>[])
            .filter((r) => r.media_type !== 'person' && (r.title || r.name))
            .slice(0, 8)
            .map((r) => ({
              id: r.id as number,
              film: {
                title: (r.title ?? r.name) as string,
                year: r.release_date ? Number(String(r.release_date).slice(0, 4)) : null,
                posterPath: r.poster_path
                  ? `https://image.tmdb.org/t/p/w185${r.poster_path as string}`
                  : null,
              },
            })),
        );
      } catch {
        if (mine === seq.current) setResults([]);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query, visible]);

  // Cleared on close so the next film is searched from an empty field rather
  // than from whatever the last desk was looking for.
  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
      {/* The ground behind the sheet closes it. Every other sheet in this app
          dismisses that way, and one that traps you until you find a film is a
          sheet that punishes changing your mind. */}
      <PressableScale
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close, without naming a film"
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(4,3,2,0.72)' }]} />
      </PressableScale>
      <View style={{ paddingBottom: bottomInset }}>
        <FilmFinder
          query={query}
          onQuery={setQuery}
          results={results.map((r) => r.film)}
          // By POSITION. Searching `results` for a matching title and year
          // returns the FIRST match, so two entries sharing both — a
          // re-release, a duplicate TMDB record — gave the member a film they
          // did not choose, and its id went into the row.
          onPick={(_f, i) => {
            const hit = results[i];
            if (hit) onPick(hit.film, hit.id);
          }}
        />
      </View>
    </View>
  );
}
