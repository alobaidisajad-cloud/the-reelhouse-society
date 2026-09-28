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
 * ── A DRAFT ONLY WHERE IT IS WORK ───────────────────────────────────────────
 * A take is a sentence: restored days later into a desk opened for something
 * else, it would be the app putting words in a member's mouth, so the short
 * desk keeps no draft. A ballot (a question and up to six film searches) is an
 * evening's fiddling, and keeps one, as the essay does.
 *
 * ── A DESK WITH NOBODY AT IT ────────────────────────────────────────────────
 * The picker is reachable signed out (the Concierge is in the bar for everyone),
 * so every desk says "Filing is for members." and goes back
 * (`useSendBackIfNotAMember`, the essay desk's own answer), never a blank modal.
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
import { hourLabel } from '@/src/components/dispatch/dayLabel';
import { tmdb } from '@/src/lib/tmdb';
import { useAuthStore } from '@/src/stores/auth';
import { clearDraft, readDraft, writeDraft } from '@/src/utils/memberDrafts';
import { useDispatch } from '@/src/stores/dispatch';
import { paperTierOf, type BallotOption } from '@/src/stores/dispatchTypes';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import reelToast from '@/src/utils/reelToast';
import { showTierDoor } from '@/src/utils/tierDoor';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';

/** Set when the desk OPENS; a ticking clock would re-render the desk mid-typing. */
function useOpeningHour(): string {
  return useMemo(() => hourLabel(new Date().toISOString()), []);
}

/** The four facts a byline draws, for the member at the desk. */
function useMe() {
  const user = useAuthStore((s) => s.user);
  return useMemo(() => (user ? {
    name: user.username ?? '',
    memberNo: (user as { member_no?: number }).member_no ?? 0,
    tier: paperTierOf(user), // their own rank, from the one place that decides it
    avatar: (user as { avatar_url?: string | null }).avatar_url ?? null,
  } : null), [user]);
}

/**
 * Signed out: say so and go back, once. `isMounted` because this fires while
 * the modal is still animating in, where an unguarded pop could land twice.
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

  // `?edit=<id>`: the same desk, amending. Two desks for one shape would drift.
  const editId = useLocalSearchParams<{ edit?: string }>().edit;
  /**
   * From the store the reader already filled, read ONCE: it only seeds the
   * `useState`s below, and a subscription would re-render the desk mid-typing.
   * Not found: `amending` is false and the desk files a new filing, never an
   * empty amendment.
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
  /** A wire's source, as the member types it (never the film's title). */
  const [source, setSource] = useState(() => (existing?.source ?? ''));
  const [film, setFilm] = useState<PaperFilm | null>(() => existing?.film ?? null);
  const [filmId, setFilmId] = useState<number | null>(() => existing?.subjectId ?? null);
  const [spoiler, setSpoiler] = useState(() => !!existing?.spoilerLabel);
  const [finding, setFinding] = useState(false);
  const [sending, setSending] = useState(false);

  const remaining = MAX_LENGTHS.filingBody - body.length;

  /** A wire needs its source (the `wire_source` CHECK): FILE IT stays unlit till then. */
  const ready = body.trim().length > 0 && remaining >= 0
    && (kind !== 'wire' || source.trim().length > 0);

  const onFile = useCallback(async () => {
    if (!ready || sending) return;
    setSending(true);

    // Amending sends the words, never the film: the critiques argue about that
    // film. The wrong film is withdrawn and filed again.
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
        reelToast.error('It could not be amended.'); // the new words are still in the field
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
      // "Still here", not "kept": this desk keeps no draft.
      reelToast.error('It did not go. Your words are still here.');
    } finally {
      setSending(false);
    }
  }, [ready, sending, kind, body, spoiler, film, filmId, source, amending, editId]);

  // Sent back by the hook above; this render is the one frame before it lands.
  if (!me) return null;

  return (
    <View style={p.screen}>
      <RoomLight room="dispatch" />
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
        // BACK returns to the choice of form, not out of the modal.
        onBack={() => router.setParams({ kind: '' })}
        onFile={onFile}
        onFilm={() => setFinding(true)}
        // A still is its film's; before a film is named, the desk says so.
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

  const userId = useAuthStore((s) => s.user?.id); // the draft's key; `useMe` is the byline

  const [question, setQuestion] = useState('');
  // Every slot drawn empty from the start, so the ballot's shape shows first.
  // BALLOT_MAX, as the `ballot_options` CHECK allows two to six.
  const [slots, setSlots] = useState<({ film: PaperFilm; id: number } | null)[]>(
    Array.from({ length: BALLOT_MAX }, () => null),
  );
  const [closes, setCloses] = useState('2 DAYS');
  const [finding, setFinding] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // The draft. Its deadline is safe to restore: `closes` is a relative label
  // (`2 DAYS`), made a time only at filing, so it can never restore as past.
  useEffect(() => {
    if (!userId) return;
    const held = readDraft<{
      question?: string;
      slots?: ({ film: PaperFilm; id: number } | null)[];
      closes?: string;
    }>(userId, 'ballot');
    if (!held) return;
    if (held.data.question) setQuestion(held.data.question);
    if (held.data.closes) setCloses(held.data.closes);
    if (Array.isArray(held.data.slots)) {
      // Padded to the full row, whatever BALLOT_MAX was when it was saved.
      const restored = Array.from({ length: BALLOT_MAX }, (_, i) => held.data.slots![i] ?? null);
      setSlots(restored);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const t = setTimeout(() => {
      if (question.trim() || slots.some(Boolean)) {
        writeDraft(userId, 'ballot', { question, slots, closes });
      } else {
        clearDraft(userId, 'ballot');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [question, slots, closes, userId]);

  const filled = slots.filter(Boolean).length;
  const ready = filled >= BALLOT_MIN && question.trim().length > 0 && !sending;

  const onFile = useCallback(async () => {
    if (!ready) return;
    setSending(true);
    try {
      // `closes_at` is compared at RENDER time: no job has to run to close it.
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
        body: question.trim(), // the `published_has_body` CHECK needs one
        options,
        closesAt,
      });
      clearDraft(userId, 'ballot'); // only once the house has it
      reelToast.success(filed?.offline ? 'Filed. It goes out when the wire is back.' : 'The ballot is open');
      router.replace('/(tabs)/dispatch');
    } catch (e) {
      // Reached by link without the rank: the house says why, and the way to it.
      if (showTierDoor(e, { returnTo: '/dispatch/compose?kind=ballot', also: 'Your question is kept.' })) return;
      reelToast.error('The ballot could not be opened. Your question is kept.');
    } finally {
      setSending(false);
    }
  }, [ready, question, slots, closes, userId]);

  // Sent back by the hook above; this render is the one frame before it lands.
  if (!me) return null;

  return (
    <View style={p.screen}>
      <RoomLight room="dispatch" />
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <BallotDesk
        me={me}
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
          // One film cannot stand twice and split its own vote; the database
          // only counts options, so the desk refuses it, in words.
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

/** The desks' one film sheet: TMDB, as every film field in the app, so one film has one id. */
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

  // Debounced, and the LAST request wins: a late early reply must not paint
  // results for a query the member has already changed.
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
                // The wide still for an essay's 176pt cover band (a 2:3 poster
                // would crop to a chin). w780, under a gradient, is plenty; many
                // films have none, and the essay then draws no cover.
                backdropPath: r.backdrop_path
                  ? `https://image.tmdb.org/t/p/w780${r.backdrop_path as string}`
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

  // Emptied on close: the next search starts from a clean field.
  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'flex-end' }]}>
      {/* The ground behind closes it, as every sheet in the app does. */}
      <PressableScale
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close, without naming a film"
      >
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(6,5,4,0.72)' }]} />
      </PressableScale>
      <View style={{ paddingBottom: bottomInset }}>
        <FilmFinder
          query={query}
          onQuery={setQuery}
          results={results.map((r) => r.film)}
          // By POSITION: two results can share a title and year.
          onPick={(_f, i) => {
            const hit = results[i];
            if (hit) onPick(hit.film, hit.id);
          }}
        />
      </View>
    </View>
  );
}
