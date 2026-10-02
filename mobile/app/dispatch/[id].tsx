/**
 * THE READER — one screen for all five kinds of filing.
 * ─────────────────────────────────────────────────────────────────────────────
 * One reader, so a spoiler veil and a markdown guard are fixed in one place.
 *
 * ── WHY A ROUTE AND NOT A MODAL ─────────────────────────────────────────────
 * A filing has an address. A notification points at one, a lounge message quotes
 * one, a share card carries a link to one — and none of those can open a modal
 * that only exists while the feed is mounted. `/dossier/[id]` redirects here so
 * every older link still lands.
 *
 * ── ONE DOCKED THING, EVER ──────────────────────────────────────────────────
 * The action bar and the critique composer occupy the same place and never
 * stack: pressing CRITIQUE replaces the bar with the field, and dismissing the
 * field brings the bar back. Two docked rows would take a third of a small
 * phone's screen and leave the writing in a slot.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { Text } from '@/src/components/text';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import { askToWithdrawCritique } from '@/src/components/critique/withdraw';
import { offerWord } from '@/src/lib/pushPrimer';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import { ShareSheet } from '@/src/components/dispatch/paper/PaperDesk';
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import { readTimeOf } from '@/src/components/dispatch/readTime';
import { PaperBallot } from '@/src/components/dispatch/paper/PaperBallot';
import {
  CritiqueComposer, CritiqueFooter, CritiqueHead, PaperCritiqueRow, CritiqueSpine, PostDock,
} from '@/src/components/dispatch/paper/PaperCritiques';
import { EssayHead, EssayNext } from '@/src/components/dispatch/paper/PaperEssay';
import { PaperEmpty, PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { DossierShareCard, PaperBack } from '@/src/components/dispatch/paper/PaperMore';
import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { NOT_SENT_LINE, WITHHELD_LINE, partOf } from '@/src/components/dispatch/paper/paperText';
import { measure, KIND_NAME } from '@/src/components/dispatch/paper/paperMetrics';
import { LobbyHonour } from '@/src/components/lobby/LobbyHonour';
import { roomOf } from '@/src/components/dispatch/roomLink';
import { hourLabel } from '@/src/components/dispatch/dayLabel';
import { useAuthStore } from '@/src/stores/auth';
import { clearDraft, readDraft, writeDraft } from '@/src/utils/memberDrafts';
import { useDispatch } from '@/src/stores/dispatch';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/src/lib/supabase';
import { FILING_FULL_COLUMNS, parseFilingRows, paperTierOf } from '@/src/stores/dispatchTypes';
import type { CritiqueOrder, Filing } from '@/src/stores/dispatchTypes';
import { colors } from '@/src/theme/theme';
import { nav } from '@/src/utils/typedRouter';
import reelToast from '@/src/utils/reelToast';
import { timeAgo, timeUntil, formatDateMonthDay } from '@/src/utils/timeAgo';
import { scaledTextProps } from '@/src/constants/textScaling';
import { TryAgainLine } from '@/src/components/TryAgain';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import { useScreenReady } from '@/src/hooks/useScreenReady';
import { useUnsent } from '@/src/stores/offlineQueueStore';
import { HOUSE_WEB } from '@/src/constants/support';

/** The house's own mark, bundled — never a stand-in glyph on the share card. */
const HOUSE_MARK = require('@/assets/images/reelhouse-logo.png');

/** The critiques' order before anyone chooses: for the state AND the first read. */
const FIRST_ORDER: CritiqueOrder = 'CERTIFIED';

export default function FilingReader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  // The page is measured at THIS screen's width, not a 390pt phone's.
  const { width: screenWidth } = useWindowDimensions();
  const me = useAuthStore((s) => s.user);

  const filings = useDispatch((s) => s.filings);
  const critiques = useDispatch((s) => s.critiques);
  /** The next part of this essay's series; one row, for one screen, so not in the store. */
  const [nextPart, setNextPart] = useState<Filing | null>(null);
  const opened = useDispatch((s) => s.opened);
  const critiquesLoading = useDispatch((s) => s.critiquesLoading);
  const critiquesLoadingMore = useDispatch((s) => s.critiquesLoadingMore);
  const certifiedIds = useDispatch((s) => s.certifiedIds);
  const certifiedCritiqueIds = useDispatch((s) => s.certifiedCritiqueIds);
  const savedIds = useDispatch((s) => s.savedIds);
  const myVotes = useDispatch((s) => s.myVotes);

  const [filing, setFiling] = useState<Filing | null>(() => filings.find((f) => f.id === id) ?? null);
  const [loading, setLoading] = useState(!filing);
  /** The last read failed: a filing not held here may still exist. */
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const readyMark = useScreenReady('reader', !loading);
  const [order, setOrder] = useState<CritiqueOrder>(FIRST_ORDER);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  // A critique's draft survives a phone call, kept per FILING so two essays'
  // critiques never mix. (The short desks keep none: a take is a sentence.)
  useEffect(() => {
    if (!id || !me?.id) return;
    const held = readDraft<{ body?: string }>(me.id, 'critique', id);
    if (held?.data.body) { setDraft(held.data.body); setComposing(true); }
  }, [id, me?.id]);

  useEffect(() => {
    if (!id || !me?.id) return;
    const t = setTimeout(() => {
      if (draft.trim()) writeDraft(me.id, 'critique', { body: draft }, id);
      else clearDraft(me.id, 'critique', id);
    }, 1000);
    return () => clearTimeout(t);
  }, [draft, id, me?.id]);
  const scroller = useRef<ScrollView>(null);
  // Where the critiques begin, for the mark of a filing that is gone.
  const critiquesAt = useRef(0);
  /** The off-screen clipping, captured when an essay is shared out of the app. */
  const cardRef = useRef<ViewShot>(null);

  const [actions, setActions] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toLounge, setToLounge] = useState(false);
  // WHAT is reported: reporting a critique must not report the page it is on.
  const [report, setReport] = useState<
    { type: 'dispatch_post' | 'dispatch_comment'; id: string; userId: string; username: string } | null
  >(null);

  // The store's copies first (`opened`: reached from a notification), so a mark shows.
  const live = filings.find((f) => f.id === id) ?? opened[id] ?? filing;
  // Filed on this phone while the wire was down, and not gone yet.
  const pending = useUnsent('add_filing').has(id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const got = await useDispatch.getState().hydrate(id);
      if (cancelled) return;
      setUnreachable(got === 'unreachable');
      if (got !== 'unreachable') {
        setFiling(got);
        void useDispatch.getState().fetchCritiques(id, FIRST_ORDER);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, attempt]);

  // The next part: the lowest part number above this one that a reader could
  // open, behind the series page's three gates, so a withheld part is never next.
  useEffect(() => {
    const seriesId = live?.seriesId;
    const part = live?.partNumber;
    if (!seriesId || part == null) { setNextPart(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('dispatch_posts')
          .select(FILING_FULL_COLUMNS)
          .eq('series_id', seriesId)
          .eq('is_published', true)
          .is('withheld_at', null)
          .is('ended_at', null)
          .gt('part_number', part)
          .order('part_number', { ascending: true })
          .limit(1);
        if (error) throw error;
        if (cancelled) return;
        setNextPart(parseFilingRows(data ?? []).filings[0] ?? null);
      } catch {
        if (!cancelled) setNextPart(null); // no foot, rather than one that goes nowhere
      }
    })();
    return () => { cancelled = true; };
  }, [live?.seriesId, live?.partNumber]);

  /** In the server's order, never re-sorted here: the critiques come in pages. */
  const rows = critiques[id] ?? [];

  /** Their Dispatch ROOM, which the byline promises; the room links their file. */
  const openAuthor = useCallback((username?: string | null) => {
    if (username) nav.push(roomOf(username));
  }, []);

  const openFilm = useCallback(() => {
    if (live?.subjectId) nav.push(`/film/${live.subjectId}`);
  }, [live?.subjectId]);

  /**
   * ELSEWHERE, the world (the sheet offers the house's LOUNGE first). An essay
   * leaves as a clipping: a picture of somebody's take or question is a
   * poster nobody makes. The link is the DEPARTMENT, which exists: a custom
   * `reelhouse://` link opens nothing without the app, and the web has no
   * page for one filing yet (DEFERRED-ACTIONS.md, "A web page for one filing").
   */
  const shareElsewhere = useCallback(async () => {
    if (!live) return;
    setSharing(false);

    const link = `${HOUSE_WEB}/dispatch`;
    if (live.kind === 'dossier' && cardRef.current) {
      try {
        const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        // iOS: `Share.share` carries the picture AND the link (`shareAsync`
        // sends a file only). Android's `Share` ignores `url`, so there the
        // picture goes alone through `shareAsync`.
        if (Platform.OS === 'ios') {
          await Share.share({ url: uri, message: `${live.title ?? ''}\n\n${link}` });
          return;
        }
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: live.title ?? 'An essay' });
          return;
        }
        await Share.share({ message: `${live.title ?? ''}\n\n${link}` });
        return;
      } catch {
        // A failed capture falls through to the plain line below.
      }
    }

    try {
      await Share.share({ message: `${live.title || live.body}\n\nThe Dispatch — ${link}` });
    } catch {
      // A share sheet the member dismissed is not an error.
    }
  }, [live]);

  const fileCritique = useCallback(async () => {
    if (!live || sending) return;
    setSending(true);
    try {
      const res = await useDispatch.getState().addCritique(live.id, draft);
      setDraft('');
      clearDraft(me?.id, 'critique', live.id); // once the house or the queue has it
      setComposing(false);
      // Queued without a connection: said, as a filing says it — it was drawn as
      // though it had gone.
      if (res?.offline) reelToast.success('Filed. It goes out when the wire is back.');
      // Filed, where members may certify or answer it: the moment to ask to send word.
      const memberId = me?.id;
      if (memberId) void offerWord('critique', memberId);
    } catch {
      // The store rolls the row back and keeps the text for another try.
      reelToast.error('That critique did not go.');
    } finally {
      setSending(false);
    }
    // `me?.id` is the draft's KEY: without it, after a change of member, the
    // wrong member's draft would be the one cleared.
  }, [live, draft, sending, me?.id]);

  // Never a ballot (a changed question makes the votes answer something else), nor
  // a withheld or ended filing, which the database refuses too (20260905_02).
  const amendable = !!live && !!me && live.authorId === me.id
    && !live.withheldAt && !live.endedAt && live.kind !== 'ballot';

  const openAmend = useCallback(() => {
    if (!live) return;
    // The dossier desk takes its title and essay as params; the short desks read
    // the filing out of the store, which the reader has already hydrated.
    nav.push(live.kind === 'dossier'
      ? `/dispatch/compose?kind=dossier&edit=${live.id}`
      : `/dispatch/compose?kind=${live.kind}&edit=${live.id}`);
  }, [live]);

  const confirmWithdraw = useCallback(() => {
    if (!live) return;
    Alert.alert(
        'Withdraw this filing?',
        'The words go. The critiques underneath it stay, and so does the page they are on. This cannot be undone.',
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Withdraw',
            style: 'destructive',
            onPress: async () => {
              try {
                await useDispatch.getState().end(live.id);
              } catch {
                reelToast.error('It could not be withdrawn.');
              }
            },
          },
        ],
    );
  }, [live]);

  /**
   * More: on your own filing, amend or withdraw (withdrawing always asks again,
   * and says the critiques stay: "Delete?" would be untrue). On anyone else's,
   * the app's one report/block/mute sheet.
   */
  const openMore = useCallback(() => {
    if (!live) return;
    if (!!me && live.authorId === me.id) {
      if (amendable) {
        Alert.alert(
          'This filing',
          'You can change the words, or take it off the page.',
          [
            { text: 'Amend it', onPress: openAmend },
            { text: 'Withdraw it', style: 'destructive', onPress: () => confirmWithdraw() },
            { text: 'Keep it as it is', style: 'cancel' },
          ],
        );
        return;
      }
      confirmWithdraw();
      return;
    }
    setActions(true);
  }, [live, me, amendable, openAmend, confirmWithdraw]);

  if (loading) {
    return (
      <View style={[p.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <RoomLight room="dispatch" />
        {readyMark}
        <ActivityIndicator size="small" color={colors.sepia} />
      </View>
    );
  }

  // Not reached: the same page as the feed's, and a way to ask again.
  if (!live && unreachable) {
    return (
      <View style={p.screen}>
        <RoomLight room="dispatch" />
        {readyMark}
        <PaperBack label="THE DISPATCH" onBack={() => nav.back()} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <PaperEmpty
            title="This filing could not be reached."
            body="Check the connection, and try again."
            action="TRY AGAIN"
            onAction={() => { setLoading(true); setAttempt((n) => n + 1); }}
          />
        </View>
      </View>
    );
  }

  // Gone, reached from an old notification or link: a real page, not a spinner.
  if (!live) {
    return (
      <View style={p.screen}>
        <RoomLight room="dispatch" />
        {readyMark}
        <PaperBack label="THE DISPATCH" onBack={() => nav.back()} />
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={p.emptyTitle} accessibilityRole="header" {...scaledTextProps}>
            This filing is no longer here.
          </Text>
          <Text style={p.emptyBody} {...scaledTextProps}>
            It may have been withdrawn by its author, or removed by the house.
          </Text>
        </View>
      </View>
    );
  }

  const author = live.author;
  const ended = !!live.endedAt;
  const mine = !!me && live.authorId === me.id;
  const certified = certifiedIds.has(live.id);
  const saved = savedIds.has(live.id);
  const width = measure(screenWidth);

  // A filing takes acts only while it stands and the house has it: not once
  // withdrawn, not while withheld, not before it is sent. The house refuses
  // each (critiques_open_post, certs_open_post); the page does not offer them.
  const open = !ended && !live.withheldAt && !pending;

  // A signed-out reader gets no More: every act behind it needs an account. A
  // withdrawn filing has nothing left to amend, withdraw or report.
  const more = me && !ended ? openMore : undefined;

  const head = live.kind === 'dossier'
    ? <PaperBack label={KIND_NAME.dossier} onBack={() => nav.back()} onMore={more} />
    : (
      <CritiqueSpine
        kind={live.kind}
        opening={live.title || live.body}
        count={live.commentCount}
        onBack={() => nav.back()}
        onTop={() => scroller.current?.scrollTo({ y: 0, animated: true })}
        onMore={more}
      />
    );

  return (
    <View style={p.screen}>
      <RoomLight room="dispatch" />
      {readyMark}
      {head}

      <ScrollView
        ref={scroller}
        // The app's law for a router screen: the OS moves the content for the
        // keyboard. KeyboardAvoidingView is for a Modal, and using it here would
        // fight the inset the system already applies.
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        <PaperSheet>
          {/* The honour stays: the day this filing hung in the Lobby, if it did. */}
          <LobbyHonour kind="post" id={id} style={{ marginBottom: 12 }} />
          {/* ── THE FILING ─────────────────────────────────────────────────
              Each kind is drawn by the component the design drew for it, and
              nothing here re-implements one. An ended filing keeps its room:
              PaperPost prints the tombstone and the critiques below survive,
              which is the entire reason ending is not deleting. */}
          {live.kind === 'dossier' && !ended ? (
            <>
              <EssayHead
                title={live.title ?? ''}
                series={live.seriesTitle ? partOf(live.partNumber, live.seriesTitle) : undefined}
                // A departed member is null, which the byline draws as departed
                // and offers no door: a stand-in name opened a room that is not there.
                author={author}
                readTime={readTimeOf(live.fullContent ?? live.body)}
                filed={formatDateMonthDay(live.createdAt).toUpperCase()}
                film={live.film}
                onAuthor={author ? () => openAuthor(author.name) : undefined}
                onFilm={live.subjectId ? openFilm : undefined}
                // `from` is this part, so the series page marks where the reader
                // already is instead of making them find it.
                onSeries={live.seriesId
                  ? () => nav.push(`/dispatch/series/${live.seriesId}?from=${live.id}`)
                  : undefined}
              />
              {/* An essay has no card to carry the line the other kinds carry,
                  so it is said under the head, before the reading begins, on
                  the body's own edge (the card's indent is for its byline). */}
              {pending ? (
                <Text style={[p.wireSource, { paddingLeft: 0, marginTop: 0, marginBottom: 16 }]} numberOfLines={2} {...scaledTextProps}>
                  {NOT_SENT_LINE}
                </Text>
              ) : null}
              {/* Withheld, it is read by its author alone (RLS refuses the rest),
                  and says so, as a card does under its stamp. */}
              {live.withheldAt ? (
                <Text style={[p.removedText, { textAlign: 'left', marginTop: 0, marginBottom: 16 }]} {...scaledTextProps}>
                  {WITHHELD_LINE}
                </Text>
              ) : null}
              <EssayBody text={live.fullContent ?? live.body} />
              {/* The feed carries only an essay's opening. When the whole of it
                  could not be read, that is said, with a way to ask again —
                  never drawn as though the essay ended there. */}
              {unreachable && !live.fullContent ? (
                <View style={{ marginTop: 20, gap: 10, alignItems: 'flex-start' }}>
                  <Text style={[p.removedText, { textAlign: 'left' }]} {...scaledTextProps}>
                    The rest of this essay could not be reached.
                  </Text>
                  <TryAgainLine
                    onPress={() => { setLoading(true); setAttempt((n) => n + 1); }}
                    accessibilityLabel="Read the whole essay again"
                  />
                </View>
              ) : null}
              {/* The foot of a part. Absent when there is no next one, because a
                  control that says NEXT and opens nothing is worse than an essay
                  that simply ends. */}
              {nextPart ? (
                <EssayNext
                  label="NEXT IN THE SERIES"
                  title={nextPart.title ?? ''}
                  readTime={readTimeOf(nextPart.fullContent ?? nextPart.body)}
                  onPress={() => nav.push(`/dispatch/${nextPart.id}`)}
                />
              ) : null}
            </>
          ) : live.kind === 'ballot' && !ended ? (
            <PaperBallot
              question={live.title ?? live.body}
              author={author}
              options={(live.options ?? []).map((o, i) => ({
                title: o.title,
                posterPath: o.poster_path ?? null,
                // From the frozen count only: an open ballot shows no numbers.
                votes: live.frozenTotals?.counts?.[String(i)] ?? 0,
              }))}
              myVote={myVotes[live.id] ?? null}
              closed={!!live.closesAt && new Date(live.closesAt) <= new Date()}
              closesLabel={live.closesAt && timeUntil(live.closesAt) ? `closes ${timeUntil(live.closesAt)}` : ''}
              // Whether the result has actually been COUNTED, not merely whether
              // the ballot has closed. Without it every option reads 0 and the
              // page announced NO BALLOTS WERE CAST under a question members had
              // marked — see PaperBallot's own note.
              sealed={!!live.frozenTotals}
              certifyCount={live.certifyCount}
              commentCount={live.commentCount}
              certified={certified}
              saved={saved}
              pending={pending}
              // Acts need a member; without one each would do nothing on a press.
              // Share, the byline and the film need no account.
              onVote={me ? (i) => useDispatch.getState().vote(live.id, i) : undefined}
              onCertify={me ? (next) => useDispatch.getState().certify(live.id, next) : undefined}
              onCritique={me ? () => setComposing(true) : undefined}
              onShare={() => setSharing(true)}
              onSave={me ? (next) => useDispatch.getState().save(live.id, next) : undefined}
              onAuthor={() => openAuthor(author?.name)}
            />
          ) : (
            <PaperPost
              kind={live.kind}
              author={author}
              body={live.body}
              source={live.source ?? undefined}
              film={live.film}
              order={hourLabel(live.createdAt)}
              orderIs="hour"
              measureWidth={width}
              certifyCount={live.certifyCount}
              commentCount={live.commentCount}
              certified={certified}
              saved={saved}
              answered={!!live.answerId}
              spoiler={live.spoilerLabel}
              // Only its author can see a withheld filing (RLS refuses the rest).
              withheld={!!live.withheldAt}
              ended={live.endedBy ?? undefined}
              edited={!!live.editedAt}
              pending={pending}
              // Gated on a member, for the reason given on the ballot above.
              onCertify={me ? (next) => useDispatch.getState().certify(live.id, next) : undefined}
              // The tombstone's one mark leads to the critiques that survive it,
              // just below; the house takes no new one under words that are gone.
              onCritique={ended
                ? () => scroller.current?.scrollTo({ y: critiquesAt.current, animated: true })
                : me ? () => setComposing(true) : undefined}
              onShare={() => setSharing(true)}
              onSave={me ? (next) => useDispatch.getState().save(live.id, next) : undefined}
              onAuthor={() => openAuthor(author?.name)}
              onFilm={live.subjectId ? openFilm : undefined}
            />
          )}

          {/* ── THE CRITIQUES ──────────────────────────────────────────────
              Drawn under an ended filing too: they survive it. A new order
              re-reads from the first page, as the order is the server's. */}
          <View onLayout={(e) => { critiquesAt.current = e.nativeEvent.layout.y; }}>
            <CritiqueHead
              count={live.commentCount}
              order={order}
              onOrder={(o) => {
                if (o === order) return;
                setOrder(o);
                void useDispatch.getState().fetchCritiques(live.id, o);
              }}
            />
          </View>

          {rows.map((c, i) => (
            <PaperCritiqueRow
              key={c.id}
              top={order === 'CERTIFIED' && i === 0 && c.certifyCount > 0}
              c={{
                id: c.id,
                author: c.author,
                body: c.body,
                certifyCount: c.certifyCount,
                certified: certifiedCritiqueIds.has(c.id),
                age: timeAgo(c.createdAt).toUpperCase(),
                mine: !!me && c.authorId === me.id,
                taken: live.answerId === c.id,
              }}
              // Only who asked, only on a seeking; the server refuses the rest too.
              canTake={live.kind === 'seeking' && mine && !ended}
              onTake={() => useDispatch.getState().takeAnswer(live.id, c.id)}
              // Gated on a member, like every act.
              onCertify={me ? (next) => useDispatch.getState().certifyCritique(c.id, live.id, next) : undefined}
              onAuthor={() => openAuthor(c.author?.name)}
              onDelete={
                me && c.authorId === me.id
                  ? () => askToWithdrawCritique(() => {
                    useDispatch.getState().removeCritique(c.id, live.id)
                      .catch(() => reelToast.error('It could not be withdrawn.'));
                  })
                  : undefined
              }
              onReport={
                // Not a departed member's: there is no account to report.
                me && c.authorId && c.authorId !== me.id && c.author
                  ? () => setReport({
                    type: 'dispatch_comment',
                    id: c.id,
                    userId: c.authorId as string,
                    username: c.author!.name,
                  })
                  : undefined
              }
            />
          ))}

          <CritiqueFooter
            shown={rows.length}
            total={live.commentCount}
            loading={!!critiquesLoading[id]}
            loadingMore={!!critiquesLoadingMore[id]}
            onMore={() => useDispatch.getState().loadMoreCritiques(live.id)}
          />
        </PaperSheet>
      </ScrollView>

      {/* ── ONE DOCKED THING ───────────────────────────────────────────────
          The composer REPLACES the bar. A signed-out reader gets neither, and
          so does a filing that takes no acts (`open`). */}
      {me && open ? (
        composing ? (
          <CritiqueComposer
            me={{
              name: me.username ?? '',
              memberNo: (me as { member_no?: number }).member_no ?? 0,
              // Their own rank, from the one place that decides it.
              tier: paperTierOf(me),
              avatar: (me as { avatar_url?: string | null }).avatar_url ?? null,
            }}
            value={draft}
            onChangeText={setDraft}
            onFile={fileCritique}
            sending={sending}
            bottomInset={insets.bottom + 10}
          />
        ) : (
          <PostDock
            certifyCount={live.certifyCount}
            commentCount={live.commentCount}
            certified={certified}
            saved={saved}
            bottomInset={insets.bottom + 12}
            onCertify={(next) => useDispatch.getState().certify(live.id, next)}
            onCritique={() => setComposing(true)}
            onShare={() => setSharing(true)}
            onSave={(next) => useDispatch.getState().save(live.id, next)}
          />
        )
      ) : null}

      {/* ── THE CLIPPING, RENDERED OFF-SCREEN ────────────────────────────────
          Only while the share sheet is open on an essay. Parked off the left
          edge, not hidden: `ViewShot` cannot capture `display: none`, and
          `opacity: 0` captures as transparent on iOS. */}
      {sharing && live.kind === 'dossier' ? (
        <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none">
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
            <DossierShareCard
              title={live.title ?? ''}
              opening={live.fullContent ?? live.body}
              author={author}
              filed={formatDateMonthDay(live.createdAt).toUpperCase()}
              logo={Image.resolveAssetSource(HOUSE_MARK).uri}
              // A picture, the same on every phone: a 390pt page's measure.
              width={measure(390)}
            />
          </ViewShot>
        </View>
      ) : null}

      {/* ── THE TWO SHEETS ─────────────────────────────────────────────────
          The app's own, not new ones. A member who has reported a log knows
          exactly what this is, which is the point of not inventing a third. */}
      {live.authorId && author ? (
        <ContentActionSheet
          visible={actions}
          targetUserId={live.authorId}
          targetUsername={author.name}
          contentType="dispatch_post"
          contentId={live.id}
          onClose={() => setActions(false)}
          onReport={() => {
            setActions(false);
            setReport({
              type: 'dispatch_post',
              id: live.id,
              userId: live.authorId as string,
              username: author.name,
            });
          }}
          onBlock={() => {
            setActions(false);
            nav.back(); // blocked: their filing is not what the member wants to see
          }}
        />
      ) : null}

      <ReportSheet
        visible={!!report}
        contentType={report?.type ?? 'dispatch_post'}
        contentId={report?.id ?? ''}
        targetUserId={report?.userId ?? ''}
        targetUsername={report?.username ?? ''}
        onDismiss={() => setReport(null)}
      />

      {/* ── WHERE IT GOES ──────────────────────────────────────────────────
          The house first, the world second. No SAVE THE CARD: see `card`. */}
      {sharing ? (
        <View style={[p.sheetHost, { paddingBottom: insets.bottom }]}>
          <PressableScale
            style={p.sheetGround}
            onPress={() => setSharing(false)}
            accessibilityRole="button"
            accessibilityLabel="Close, without sharing"
          />
          <ShareSheet
            preview={<Text style={p.sharePreview} numberOfLines={2} {...scaledTextProps}>
              {live.title || live.body}
            </Text>}
            onDest={(label) => {
              if (label === 'TO THE LOUNGE') { setSharing(false); setToLounge(true); }
              else void shareElsewhere();
            }}
          />
        </View>
      ) : null}

      <ShareToLoungeModal
        visible={toLounge}
        onClose={() => setToLounge(false)}
        // Every kind goes this way. "dossier" is the message type's name, kept
        // for the messages already in rooms; `dossierKind` makes a take say TAKE.
        dossierId={live.id}
        dossierTitle={live.title || live.body}
        dossierAuthor={author?.name}
        dossierKind={live.kind}
      />
    </View>
  );
}

// Expo Router per-route crash net — see src/components/RouteErrorBoundary.tsx
export { RouteErrorBoundary as ErrorBoundary } from '@/src/components/RouteErrorBoundary';
