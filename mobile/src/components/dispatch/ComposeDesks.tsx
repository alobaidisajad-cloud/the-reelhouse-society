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
 * ── EVERY DESK KEEPS ITS DRAFT ──────────────────────────────────────────────
 * Nothing a member types is lost. The short desk keeps its draft as the essay
 * and the ballot keep theirs: kept as it is written, one for each form (a take
 * is never opened into a seeking's desk) and one for each amend, by its filing;
 * taken up when the desk opens again, said by the line every writing room draws
 * (TakenUpLine), with START CLEAN to let it go; and gone once the house, or the
 * queue, has the filing.
 *
 * ── A DESK WITH NOBODY AT IT ────────────────────────────────────────────────
 * The picker is reachable signed out (the Concierge is in the bar for everyone):
 * the route (app/dispatch/compose.tsx) asks a stranger in before any desk is
 * drawn, and the sign-in brings them back to it (P4.21).
 */
import { useBackCloses } from '@/src/hooks/useBackCloses';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { characterCount } from '@/src/utils/text';
import { StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { P, useRouteParams } from '@/src/utils/routeParams';
import { houseNow } from '@/src/lib/houseClock';
import { useBottomEdge } from '@/src/components/layout/navMetrics';

import PressableScale from '@/src/components/PressableScale';
import { PaperComposer } from '@/src/components/dispatch/paper/PaperComposer';
import { BallotDesk, FilmFinder } from '@/src/components/dispatch/paper/PaperDesk';
import type { PaperFilm } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import {
  BALLOT_MIN, BALLOT_MAX, DEFAULT_CLOSING, closingDays, isClosingTime, type ClosingTime,
} from '@/src/components/dispatch/paper/paperMetrics';
import { hourLabel } from '@/src/components/dispatch/dayLabel';
import { useAuthStore } from '@/src/stores/auth';
import { clearDraft, readDraft, writeDraft } from '@/src/utils/memberDrafts';
import { useDispatch } from '@/src/stores/dispatch';
import { filedSaid } from '@/src/utils/dispatchFiledSaid';
import { paperTierOf, type BallotOption, type Filing } from '@/src/stores/dispatchTypes';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import reelToast from '@/src/utils/reelToast';
import { FILING_CHANGED_SINCE, isChangedSince } from '@/src/utils/keepWhatChangedSince';
import { showTierDoor } from '@/src/utils/tierDoor';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { useCatalogueSearch } from '@/src/hooks/useCatalogueSearch';
import { useKeyboardLift } from '@/src/hooks/useKeyboardLift';
import { useClock } from '@/src/hooks/useClock';
import Animated from 'react-native-reanimated';
import { UnderSheet } from '@/src/components/layout/UnderSheet';
import { nav } from '@/src/utils/typedRouter';
import { useHoldWhileSending } from '@/src/hooks/useAskBeforeLeaving';
import { KEPT_WORDS_REST_MS } from '@/src/hooks/useKeptWords';
import { useStillHere } from '@/src/hooks/useStillHere';
import { TakenUpLine } from '@/src/components/TakenUpLine';

/** The hour the filing will carry: from the shared clock, the desk is drawn again only when the hour turns. */
function useOpeningHour(): string {
  return useClock((now) => hourLabel(new Date(now).toISOString()));
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
// ── THE SHORT DESKS ─────────────────────────────────────────────────────────

/** `?edit=<id>`: an amend, by its filing's id (routeParams, P4.4). */
const DESK_PARAMS = { edit: P.uuid };

/** Where an amend's filing is: in hand, being read, out of reach, or not one this member may amend. */
type AmendRead = 'held' | 'reading' | 'unreachable' | 'gone';

/** A filing this desk may amend: the member's own, of the desk's kind. */
function isMineToAmend(f: Filing | null | undefined, kind: string): f is Filing {
  const me = useAuthStore.getState().user?.id;
  return !!f && !!me && f.authorId === me && f.kind === kind;
}

export function ComposeShortScreen({ kind }: { kind: 'take' | 'seeking' | 'wire' }) {
  const me = useMe();
  const edge = useBottomEdge();
  const hour = useOpeningHour();

  // `?edit=<id>`: the same desk, amending. Two desks for one shape would drift.
  const editId = useRouteParams(DESK_PARAMS).edit;
  /**
   * From the store the reader already filled, read ONCE: it only seeds the
   * `useState`s below, and a subscription would re-render the desk mid-typing.
   * The reader holds only its pages and the filings opened by address: a link
   * to an older filing finds it in neither, and it is read from the house.
   */
  const held = useMemo(
    () => {
      if (!editId) return null;
      const s = useDispatch.getState();
      return s.filings.find((f) => f.id === editId) ?? s.opened[editId] ?? null;
    },
    [editId],
  );
  const [existing, setExisting] = useState<Filing | null>(() => (isMineToAmend(held, kind) ? held : null));
  /**
   * The filing to amend, until it is in hand. An amend link is always an amend: it never
   * files a new filing, and nothing is written over a filing the desk has not read.
   */
  const [amendRead, setAmendRead] = useState<AmendRead>(() => (!editId || existing ? 'held' : held ? 'gone' : 'reading'));
  const amending = !!editId;

  const [body, setBody] = useState(() => (existing?.body ?? ''));
  /** A wire's source, as the member types it (never the film's title). */
  const [source, setSource] = useState(() => (existing?.source ?? ''));
  const [film, setFilm] = useState<PaperFilm | null>(() => existing?.film ?? null);
  const [filmId, setFilmId] = useState<number | null>(() => existing?.subjectId ?? null);
  const [spoiler, setSpoiler] = useState(() => !!existing?.spoilerLabel);
  const [finding, setFinding] = useState(false);
  const [sending, setSending] = useState(false);
  const stillHere = useStillHere();

  /** The filing to amend, read from the house when the reader does not hold it. */
  const readFiled = useCallback(() => {
    if (!editId) return;
    setAmendRead('reading');
    // A read that threw is one out of reach: the desk is never left reading.
    void useDispatch.getState().hydrate(editId).catch(() => 'unreachable' as const).then((got) => {
      if (!stillHere()) return;
      if (got === 'unreachable') { setAmendRead('unreachable'); return; }
      // Gone, or not this member's filing of this kind: nothing here may be written over it.
      if (!isMineToAmend(got, kind)) { setAmendRead('gone'); return; }
      setExisting(got);
      setBody(got.body);
      setSource(got.source ?? '');
      setFilm(got.film ?? null);
      setFilmId(got.subjectId ?? null);
      setSpoiler(!!got.spoilerLabel);
      setAmendRead('held');
    });
  }, [editId, kind, stillHere]);
  const readAtOpen = useRef(amendRead === 'reading');
  useEffect(() => {
    if (!readAtOpen.current) return;
    readAtOpen.current = false;
    readFiled();
  }, [readFiled]);
  /** Filed or amended: the desk is leaving, and asks nothing on its way out. */
  const [done, setDone] = useState<'filed' | 'amended' | null>(null);

  // ── THE DRAFT ──
  // A new filing's by its form ('short', its kind); an amend's by its filing ('edit', its id), as the
  // essay keeps an amend's. Every way out keeps it, so none asks first.
  const userId = useAuthStore((st) => st.user?.id);
  /** When the draft taken up was kept; null once it is touched, or for a fresh desk. */
  const [takenUpAt, setTakenUpAt] = useState<string | null>(null);
  /** An amend left as it was filed: nothing to keep. */
  const asFiled = amending && body === (existing?.body ?? '') && source === (existing?.source ?? '')
    && spoiler === !!existing?.spoilerLabel;
  // Taken up as it renders, once per member and filing in hand, so the desk's first frame is the
  // draft; an amend's once its filing is here, over the words as filed.
  const takeUpFor = userId && amendRead === 'held' ? `${userId}:${editId ?? kind}` : null;
  const [takenFor, setTakenFor] = useState<string | null>(null);
  if (takeUpFor && takenFor !== takeUpFor) {
    setTakenFor(takeUpFor);
    if (editId) {
      const held = readDraft(userId, 'edit', editId);
      if (held && held.data.content !== undefined) {
        setBody(held.data.content);
        setSource(held.data.source ?? '');
        setSpoiler(!!held.data.spoiler);
        setTakenUpAt(held.savedAt ?? '');
      }
    } else {
      const held = readDraft(userId, 'short', kind);
      if (held && (held.data.body?.trim() || held.data.source?.trim() || held.data.film)) {
        setBody(held.data.body ?? '');
        setSource(held.data.source ?? '');
        setFilm(held.data.film ?? null);
        setFilmId(held.data.filmId ?? null);
        setSpoiler(!!held.data.spoiler);
        setTakenUpAt(held.savedAt ?? '');
      }
    }
  }

  /** The desk as it stands, kept on the phone (or let go, when empty or as filed): true once kept. */
  const keep = useCallback((): boolean => {
    if (!userId || useAuthStore.getState().user?.id !== userId) return false;
    if (editId) {
      if (asFiled) { clearDraft(userId, 'edit', editId); return true; }
      return writeDraft(userId, 'edit', { content: body, source, spoiler }, editId);
    }
    if (!body.trim() && !source.trim() && !film) { clearDraft(userId, 'short', kind); return true; }
    return writeDraft(userId, 'short', { body, source, film, filmId, spoiler }, kind);
  }, [userId, editId, asFiled, body, source, spoiler, film, filmId, kind]);

  // Kept once the desk rests a second, and at once if it closes first (the last second's words).
  const unkept = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    if (amendRead !== 'held' || done) return undefined;
    unkept.current = keep;
    const t = setTimeout(() => { unkept.current = null; keep(); }, KEPT_WORDS_REST_MS);
    return () => clearTimeout(t);
  }, [keep, amendRead, done]);
  useEffect(() => () => {
    const kept = unkept.current;
    unkept.current = null;
    kept?.();
  }, []);

  /** Lets the draft taken up go: a new desk empty, an amend as filed. */
  const startClean = useCallback(() => {
    unkept.current = null;
    if (editId) {
      clearDraft(userId, 'edit', editId);
      setBody(existing?.body ?? '');
      setSource(existing?.source ?? '');
      setSpoiler(!!existing?.spoilerLabel);
    } else {
      clearDraft(userId, 'short', kind);
      setBody('');
      setSource('');
      setFilm(null);
      setFilmId(null);
      setSpoiler(false);
    }
    setTakenUpAt(null);
  }, [userId, editId, existing, kind]);
  /** Any change lets the line about the draft taken up go, as the essay's does on a keystroke. */
  const touched = <A extends unknown[]>(act: (...a: A) => void) => (...a: A) => { setTakenUpAt(null); act(...a); };
  /** The house, or the queue, has it: the draft goes. */
  const letGo = useCallback(() => {
    unkept.current = null;
    if (editId) clearDraft(userId, 'edit', editId);
    else clearDraft(userId, 'short', kind);
  }, [userId, editId, kind]);

  // Held while FILE IT is on its way: the draft goes only once the house has the filing, so a desk
  // opened again meanwhile would take up words already on their way.
  useHoldWhileSending(sending);

  // The way out once the house has it: an amend back to the filing it amended; a filing to the
  // Dispatch the member came from (dismissed to, never replaced: a replace built a second tab
  // app over the first).
  useEffect(() => {
    if (done === 'amended') nav.back();
    else if (done === 'filed') nav.dismissTo('/(tabs)/dispatch');
  }, [done]);

  /**
   * BACK, on screen and Android's: a new filing goes back to the choice of form, its draft kept; an
   * amend has no form to choose, and goes back to the filing.
   */
  const onBack = useCallback(() => {
    if (amending) { nav.back(); return; }
    router.setParams({ kind: '' });
  }, [amending]);
  useBackCloses(!amending && !finding, onBack);

  const remaining = MAX_LENGTHS.filingBody - body.length;

  /** A wire needs its source (the `wire_source` CHECK): FILE IT stays unlit till then. */
  const ready = body.trim().length > 0 && remaining >= 0
    && (kind !== 'wire' || source.trim().length > 0) && amendRead === 'held';

  const onFile = useCallback(async () => {
    if (!ready || sending) return;
    setSending(true);

    // Amending sends the words, never the film: the critiques argue about that
    // film. The wrong film is withdrawn and filed again.
    if (amending) {
      try {
        const amended = await useDispatch.getState().amend(editId!, {
          body: body.trim(),
          spoilerLabel: spoiler ? 'SPOILERS' : null,
          source: kind === 'wire' ? (source.trim() || null) : null,
        });
        letGo();
        // Queued is not gone, as the essay's desk says it.
        reelToast.success(amended?.offline ? 'Amended. It goes out when the wire is back.' : 'Amended');
        setDone('amended');
      } catch (e) {
        // The new words are still in the field, and kept on the phone.
        keep();
        reelToast.error(isChangedSince(e) ? FILING_CHANGED_SINCE : 'It could not be amended.');
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
      letGo();
      reelToast.success(filedSaid(filed, 'Filed'));
      setDone('filed');
    } catch {
      // Kept on the phone at once, as the essay's are. A phone that cannot keep them (writeDraft
      // says no) has them in the field alone: "still here", said only while the desk stands.
      if (keep()) reelToast.error('It did not go. Your words are kept.');
      else reelToast.error(stillHere() ? 'It did not go. Your words are still here.' : 'It did not go.');
    } finally {
      setSending(false);
    }
  }, [ready, sending, kind, body, spoiler, film, filmId, source, amending, editId, stillHere, keep, letGo]);

  // Sent back by the hook above; this render is the one frame before it lands.
  if (!me) return null;

  return (
    <View style={p.screen}>
      <RoomLight room="dispatch" />
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <UnderSheet open={finding}>
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
          reading={amendRead === 'held' ? null : { state: amendRead, onReadAgain: readFiled }}
          source={source}
          onSource={kind === 'wire' ? touched(setSource) : undefined}
          onBody={touched(setBody)}
          takenUp={takenUpAt !== null ? <TakenUpLine savedAt={takenUpAt || null} onStartClean={startClean} /> : null}
          // BACK returns to the choice of form, not out of the modal (an amend, to its filing).
          onBack={onBack}
          onFile={onFile}
          onFilm={amending ? undefined : () => setFinding(true)}
          // A still is its film's; before a film is named, the desk says so.
          onStill={() => (film
            ? reelToast.success('The film’s own still is used.')
            : reelToast.error('Name a film first — the still comes with it.'))}
          onSpoiler={touched(() => setSpoiler((s) => !s))}
        />
      </UnderSheet>
      <FilmPicker
        visible={finding}
        onClose={() => setFinding(false)}
        onPick={(f, id) => { setTakenUpAt(null); setFilm(f); setFilmId(id); setFinding(false); }}
        bottomInset={edge}
      />
    </View>
  );
}

// ── THE BALLOT DESK ─────────────────────────────────────────────────────────

export function ComposeBallotScreen() {
  const me = useMe();
  const edge = useBottomEdge();
  const hour = useOpeningHour();

  const userId = useAuthStore((s) => s.user?.id); // the draft's key; `useMe` is the byline

  const [question, setQuestion] = useState('');
  // Every slot drawn empty from the start, so the ballot's shape shows first.
  // BALLOT_MAX, as the `ballot_options` CHECK allows two to six.
  const [slots, setSlots] = useState<({ film: PaperFilm; id: number } | null)[]>(
    Array.from({ length: BALLOT_MAX }, () => null),
  );
  const [closes, setCloses] = useState<ClosingTime>(DEFAULT_CLOSING);
  const [finding, setFinding] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  /** When the ballot taken up was kept; null once it is touched, or for a fresh desk. */
  const [takenUpAt, setTakenUpAt] = useState<string | null>(null);
  const [filedBallot, setFiledBallot] = useState(false);

  // The draft. Its deadline is safe to restore: `closes` is a relative label
  // (`2 DAYS`), made a time only at filing, so it can never restore as past.
  // Taken up as it renders, once per member, so the desk's first frame is the draft.
  const [draftFor, setDraftFor] = useState<string | null>(null);
  if (userId && draftFor !== userId) {
    setDraftFor(userId);
    const held = readDraft(userId, 'ballot');
    // Said, as every writing room says a draft it took up, with the way to a clean desk.
    if (held && (held.data.question || held.data.slots?.some(Boolean))) setTakenUpAt(held.savedAt ?? '');
    if (held?.data.question) setQuestion(held.data.question);
    // Only a closing time the desk still offers: an unknown one would highlight nothing.
    if (isClosingTime(held?.data.closes)) setCloses(held.data.closes);
    const kept = held?.data.slots;
    if (Array.isArray(kept)) {
      // Padded to the full row, whatever BALLOT_MAX was when it was saved.
      setSlots(Array.from({ length: BALLOT_MAX }, (_, i) => kept[i] ?? null));
    }
  }

  // Kept once the desk rests a second, and at once if it closes first (the last second's words).
  const unkept = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!userId) return;
    const keep = () => {
      if (question.trim() || slots.some(Boolean)) {
        writeDraft(userId, 'ballot', { question, slots, closes });
      } else {
        clearDraft(userId, 'ballot');
      }
    };
    unkept.current = keep;
    const t = setTimeout(() => { unkept.current = null; keep(); }, 1000);
    return () => clearTimeout(t);
  }, [question, slots, closes, userId]);
  useEffect(() => () => {
    const keep = unkept.current;
    unkept.current = null;
    keep?.();
  }, []);

  // Once open, to the Dispatch the member came from (dismissed to, never replaced).
  useEffect(() => { if (filedBallot) nav.dismissTo('/(tabs)/dispatch'); }, [filedBallot]);

  /** Any change lets the line about the ballot taken up go, as the essay's does on a keystroke. */
  const touched = <A extends unknown[]>(act: (...a: A) => void) => (...a: A) => { setTakenUpAt(null); act(...a); };
  const startClean = useCallback(() => {
    unkept.current = null;
    clearDraft(userId, 'ballot');
    setQuestion('');
    setSlots(Array.from({ length: BALLOT_MAX }, () => null));
    setCloses(DEFAULT_CLOSING);
    setTakenUpAt(null);
  }, [userId]);
  const toForms = useCallback(() => router.setParams({ kind: '' }), []);
  // Android's back is BACK: to the choice of form, the ballot kept.
  useBackCloses(finding === null, toForms);

  const filled = slots.filter(Boolean).length;
  const ready = filled >= BALLOT_MIN && question.trim().length > 0 && !sending;

  const onFile = useCallback(async () => {
    if (!ready) return;
    setSending(true);
    try {
      // `closes_at` is compared at RENDER time: no job has to run to close it.
      const closesAt = new Date(houseNow() + closingDays(closes) * 86_400_000).toISOString();

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
      unkept.current = null;
      clearDraft(userId, 'ballot'); // only once the house has it
      reelToast.success(filedSaid(filed, 'The ballot is open'));
      setFiledBallot(true);
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
      <UnderSheet open={finding !== null}>
        <BallotDesk
          me={me}
          hour={hour}
          question={question}
          onQuestion={touched(setQuestion)}
          options={slots.map((s) => s?.film ?? null)}
          closes={closes}
          ready={ready}
          onRemove={touched((i: number) => setSlots((prev) => prev.map((s, n) => (n === i ? null : s))))}
          onChoose={(i) => setFinding(i)}
          onCloses={touched(setCloses)}
          onBack={toForms}
          onFile={onFile}
          takenUp={takenUpAt !== null ? <TakenUpLine savedAt={takenUpAt || null} onStartClean={startClean} /> : null}
        />
      </UnderSheet>
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
          setTakenUpAt(null);
          setSlots((prev) => prev.map((s, n) => (n === finding ? { film: f, id } : s)));
          setFinding(null);
        }}
        bottomInset={edge}
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
  // Drawn in the desk, not a Modal: Android's back closes the picker, not the desk beneath it.
  useBackCloses(visible, onClose);
  // Debounced, and the LAST request wins (useCatalogueSearch): a late early
  // reply must not paint results for a query the member has already changed.
  const search = useCatalogueSearch(query, { delay: 280, minLength: 2, enabled: visible });
  const results = useMemo(() => (search.results as unknown as Record<string, unknown>[])
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
      } as PaperFilm,
    })), [search.results]);
  const answer = search.unreachable ? 'unreachable' as const
    : !search.searching && characterCount(query.trim()) >= 2 && results.length === 0 ? 'none' as const
    : undefined;

  // Emptied on close, as it renders: the next search starts from a clean field.
  if (!visible && query !== '') setQuery('');
  // The field is focused on open and sits at the foot of the sheet.
  const lift = useKeyboardLift(bottomInset);

  if (!visible) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      {/* The ground behind closes it, as every sheet in the app does. */}
      <PressableScale touch="wayOut"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close, without naming a film"
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,5,4,0.72)' }]} />
      </PressableScale>
      <Animated.View style={lift}>
        <FilmFinder
          query={query}
          onQuery={setQuery}
          results={results.map((r) => r.film)}
          // By POSITION: two results can share a title and year.
          onPick={(_f, i) => {
            const hit = results[i];
            if (hit) onPick(hit.film, hit.id);
          }}
          answer={answer}
          onRetry={search.retry}
        />
      </Animated.View>
    </View>
  );
}
