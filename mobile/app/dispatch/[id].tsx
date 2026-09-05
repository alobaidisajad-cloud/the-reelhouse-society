/**
 * THE READER — one screen for all five kinds of filing.
 * ─────────────────────────────────────────────────────────────────────────────
 * It replaces two: `app/dossier/[id].tsx` and the `ArticleReaderModal` the feed
 * opened over itself. Two readers for one kind of thing meant two places to fix
 * a spoiler veil, two markdown guards to remember, and a modal that could not be
 * linked to from a notification.
 *
 * ── WHY A ROUTE AND NOT A MODAL ─────────────────────────────────────────────
 * A filing has an address. A notification points at one, a lounge message quotes
 * one, a share card carries a link to one — and none of those can open a modal
 * that only exists while the feed is mounted. `/dossier/[id]` stays as a redirect
 * so every link already in the world still lands.
 *
 * ── ONE DOCKED THING, EVER ──────────────────────────────────────────────────
 * The action bar and the critique composer occupy the same place and never
 * stack: pressing CRITIQUE replaces the bar with the field, and dismissing the
 * field brings the bar back. Two docked rows would take a third of a small
 * phone's screen and leave the writing in a slot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, Share, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PressableScale from '@/src/components/PressableScale';
import ShareToLoungeModal from '@/src/components/ShareToLoungeModal';
import { ContentActionSheet } from '@/src/components/moderation/ContentActionSheet';
import ReportSheet from '@/src/components/moderation/ReportSheet';
import { ShareSheet } from '@/src/components/dispatch/paper/PaperDesk';
import { EssayBody } from '@/src/components/dispatch/EssayBody';
import { readTimeOf } from '@/src/components/dispatch/readTime';
import { PaperBallot } from '@/src/components/dispatch/paper/PaperBallot';
import {
  CritiqueComposer, CritiqueFooter, CritiqueHead, CritiqueRow, CritiqueSpine, PostDock,
} from '@/src/components/dispatch/paper/PaperCritiques';
import { EssayHead, EssayNext } from '@/src/components/dispatch/paper/PaperEssay';
import { PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { PaperBack } from '@/src/components/dispatch/paper/PaperMore';
import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { measure } from '@/src/components/dispatch/paper/paperMetrics';
import { useAuthStore } from '@/src/stores/auth';
import { useDispatch } from '@/src/stores/dispatch';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { DossierShareCard } from '@/src/components/dispatch/paper/PaperMore';
import { supabase } from '@/src/lib/supabase';

/** The house's own mark, bundled — never a stand-in glyph on the share card. */
const HOUSE_MARK = require('@/assets/images/reelhouse-logo.png');
import { FILING_FULL_COLUMNS, parseFilingRows } from '@/src/stores/dispatchTypes';
import type { CritiqueOrder, Filing } from '@/src/stores/dispatchTypes';
import { colors } from '@/src/theme/theme';
import { nav } from '@/src/utils/typedRouter';
import reelToast from '@/src/utils/reelToast';
import { timeAgo, formatDateMonthDay } from '@/src/utils/timeAgo';
import { scaledTextProps } from '@/src/constants/textScaling';

/**
 * How a filing's critiques are ordered before anyone chooses.
 *
 * Named, and used in both places, because the two places used to hold their own
 * answer and gave different ones.
 */
const FIRST_ORDER: CritiqueOrder = 'CERTIFIED';

/** How the margin prints an hour. Set once, not on a timer. */
const hourOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function FilingReader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);

  const filings = useDispatch((s) => s.filings);
  const critiques = useDispatch((s) => s.critiques);
  /**
   * The part after this one, when this filing is part of a series.
   *
   * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
   * `EssayNext` was drawn, built, labelled "NEXT IN THE SERIES" in the mockup —
   * and never mounted. Its own docstring says why it should be: "an essay in
   * four parts that ends with nothing is an essay the reader has to go and hunt
   * for." A dossier ended at its critiques and left the reader to find the SERIES
   * control back up at the head.
   *
   * Read here rather than in the store for the same reason the series page reads
   * locally: it is one row, for one screen, and nothing else wants it.
   */
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
  /**
   * The house shows the most certified first. ONE constant, used by both the
   * state and the first read — they were written separately and disagreed:
   * `useState('CERTIFIED')` beside a `fetchCritiques(id)` that defaulted to
   * NEWEST. The header lit CERTIFIED over a list ordered by date, and pressing
   * CERTIFIED did nothing, because it was already the selected value.
   */
  const [order, setOrder] = useState<CritiqueOrder>(FIRST_ORDER);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);
  /** The off-screen clipping, captured when an essay is shared out of the app. */
  const cardRef = useRef<ViewShot>(null);

  /**
   * The sheets. Two, and which one opens depends on whose filing it is.
   *
   * `report` carries what is being reported rather than assuming the filing —
   * a critique is reportable in its own right, and a member reporting the third
   * critique on a page must not silently report the page.
   */
  const [actions, setActions] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [toLounge, setToLounge] = useState(false);
  const [report, setReport] = useState<
    { type: 'dispatch_post' | 'dispatch_comment'; id: string; userId: string; username: string } | null
  >(null);

  // The store's copy is authoritative once it has one — an act performed on this
  // screen updates the store, and reading through it is what keeps the number
  // under the thumb and the number in the feed the same number.
  /**
   * The feed's copy, then the store's record of what was opened, then this
   * screen's own.
   *
   * The middle one is what makes an act VISIBLE here after a cold open. Reached
   * from a notification the filing is not in the feed, so every optimistic
   * update landed somewhere this screen was not looking and the page sat
   * unchanged while the write went through.
   */
  const live = filings.find((f) => f.id === id) ?? opened[id] ?? filing;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const got = await useDispatch.getState().hydrate(id);
      if (cancelled) return;
      setFiling(got);
      setLoading(false);
      void useDispatch.getState().fetchCritiques(id, FIRST_ORDER);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── WHAT COMES NEXT, IF ANYTHING DOES ─────────────────────────────────────
  // One row: the lowest part number above this one, in the same series, that a
  // reader could actually open. The same three gates the series page uses, so a
  // withheld or withdrawn part is never offered as "next".
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
        // The foot simply does not appear. A part that could not be looked up
        // must not become a control that goes nowhere.
        if (!cancelled) setNextPart(null);
      }
    })();
    return () => { cancelled = true; };
  }, [live?.seriesId, live?.partNumber]);

  /**
   * ── THE ORDER IS THE SERVER'S NOW ─────────────────────────────────────────
   * This used to sort on the device, over whatever had been loaded. That was
   * defensible while the whole list arrived at once, and it stopped being true
   * the moment critiques were paged: CERTIFIED would have ranked the newest
   * thirty and presented them as the most certified of the filing.
   *
   * So the list is taken exactly as the store holds it, and changing the order
   * re-reads from the first page.
   */
  const rows = critiques[id] ?? [];

  const openAuthor = useCallback((username?: string | null) => {
    if (username) nav.push(`/user/${username}`);
  }, []);

  const openFilm = useCallback(() => {
    if (live?.subjectId) nav.push(`/film/${live.subjectId}`);
  }, [live?.subjectId]);

  /**
   * ── SHARE IS TWO DESTINATIONS, NOT ONE ────────────────────────────────────
   * The design's sheet offers the LOUNGE first and everywhere else second,
   * because the first is the house and the second is the world. Handing this
   * straight to the OS sheet would have made the salons — the thing the app is
   * for — one row down a list of messaging apps.
   */
  const shareElsewhere = useCallback(async () => {
    if (!live) return;
    setSharing(false);

    /**
     * ── AN ESSAY LEAVES AS A CLIPPING, EVERYTHING ELSE AS A LINE ────────────
     * `DossierShareCard` was drawn for exactly this and never mounted, so the
     * one asset the design calls "the house's introduction to strangers" went
     * out as plain text. The app already had the whole pipeline — ViewShot and
     * `Sharing.shareAsync` carry the log card, the film card and the profile.
     *
     * Only a dossier gets an image, which is the design's own rule: a take
     * shared as a poster is a poster of somebody's opinion, and a seeking is a
     * poster of somebody's question. Nobody makes those.
     */
    /**
     * ── WHERE THIS CAME FROM, NOT A LINK TO NOWHERE ────────────────────────
     * Three URLs were considered and two of them are broken:
     *
     *   reelhouse://dispatch/<id>          the original. A custom scheme opens
     *                                      nothing for anyone without the app —
     *                                      which is everyone a share reaches —
     *                                      and many clients strip it outright.
     *   https://reelhouse.app/dispatch/<id>  what I replaced it with, and it is
     *                                      a 404: the web app routes /dispatch
     *                                      and /dispatch/compose and has no page
     *                                      for one filing, and `app.json` claims
     *                                      no associated domain, so it does not
     *                                      open the app either.
     *
     * So the link is the DEPARTMENT, which exists and renders. That is coherent
     * with what now goes out beside it: for an essay the clipping carries the
     * masthead, the title, the opening and the byline — a stranger reads the
     * writing from the image and follows the link to the house.
     *
     * A per-filing web page would be better and is a change to the WEB app, not
     * this one. Recorded in DEFERRED-ACTIONS.md rather than papered over with a
     * URL that does not resolve.
     */
    const link = 'https://reelhouse.app/dispatch';
    if (live.kind === 'dossier' && cardRef.current) {
      try {
        const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
        /**
         * ── THE LINK WAS BEING DROPPED ON THE PATH THAT ACTUALLY RUNS ───────
         * This tried `Sharing.shareAsync` FIRST, and on iOS that always
         * succeeds — so iOS always took it. `shareAsync` sends a FILE and
         * nothing else: its only options are a mime type and an Android dialog
         * title, neither of which travels with the image. The link never left
         * the phone.
         *
         * Which defeats the whole point stated three paragraphs above: "a
         * stranger reads the writing from the image and FOLLOWS THE LINK to the
         * house." They got a picture and no way back.
         *
         * React Native's `Share.share({ url, message })` carries both on iOS,
         * so that is the path now. It is genuinely iOS-only: on Android `Share`
         * ignores `url` entirely and would send the text while silently losing
         * the clipping, so Android keeps `shareAsync` and sends the image —
         * which is the best either API can do there, and is what it did before.
         */
        if (Platform.OS === 'ios') {
          await Share.share({ url: uri, message: `${live.title ?? ''}\n\n${link}` });
          return;
        }
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: live.title ?? 'A dossier' });
          return;
        }
        await Share.share({ message: `${live.title ?? ''}\n\n${link}` });
        return;
      } catch {
        // Falls through to the line below. A capture that failed must not cost
        // the member the share.
      }
    }

    try {
      // `https`, not `reelhouse://`. A custom scheme opens nothing for anybody
      // who does not already have the app — which is everybody this is being
      // sent to. `ShareCardModal` has always used the web link; this did not.
      await Share.share({ message: `${live.title || live.body}\n\nThe Dispatch — ${link}` });
    } catch {
      // A share sheet the member dismissed is not an error.
    }
  }, [live]);

  const fileCritique = useCallback(async () => {
    if (!live || sending) return;
    setSending(true);
    try {
      await useDispatch.getState().addCritique(live.id, draft);
      setDraft('');
      setComposing(false);
    } catch {
      // The store rolls the row back and keeps the text, so the member can try
      // again with what they wrote rather than retyping it.
      reelToast.error('That critique did not go.');
    } finally {
      setSending(false);
    }
  }, [live, draft, sending]);

  /**
   * ── THE MORE CONTROL, AND WHY IT IS TWO DIFFERENT THINGS ──────────────────
   * On your own filing there is one act: withdraw it. On anyone else's there is
   * the app's standard sheet — report, block, mute — the same one a log and a
   * stack open, so what a member learns once works everywhere.
   *
   * Withdrawing is confirmed, and the confirmation says what actually happens:
   * the words go and the argument underneath stays. "Delete?" would be a lie
   * about a row that is not deleted.
   */
  /**
   * ── AMENDING ────────────────────────────────────────────────────────────
   * The same desk the filing was written at, opened on the filing itself. A
   * member who has written a take once should not have to learn a second
   * screen to fix a word in it.
   *
   * NOT OFFERED ON A BALLOT. Its options are what members voted on and its
   * question is what they answered; changing either turns a result into an
   * answer to something else. A ballot is withdrawn and called again.
   *
   * NOT OFFERED ON A WITHHELD OR ENDED FILING either — the house is reading
   * that one, or has already struck it. The database refuses both since
   * 20260905_02, so this is the app agreeing with the rule rather than the
   * only thing holding it.
   */
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

  const openMore = useCallback(() => {
    if (!live) return;
    if (!!me && live.authorId === me.id) {
      /**
       * Two acts now, so the first sheet asks WHICH — and withdrawing keeps its
       * own confirmation underneath, because it is the irreversible one and a
       * single tap should never reach it.
       */
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
  }, [live, me, amendable, openAmend]);

  if (loading) {
    return (
      <View style={[p.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="small" color={colors.sepia} />
      </View>
    );
  }

  /**
   * A filing that is not there.
   *
   * Reachable from a notification about something the house has since removed
   * entirely, or from a stale link. It is a real state and it gets a real page —
   * a blank screen with a spinner that never stops is how an app tells somebody
   * their tap did nothing.
   */
  if (!live) {
    return (
      <View style={p.screen}>
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
  const width = measure(390);

  // A signed-out reader is offered nothing to do TO the filing — every act
  // behind this control needs an account, and a menu whose every row bounces you
  // to a sign-in you did not ask for is worse than no menu.
  const more = me ? openMore : undefined;

  const head = live.kind === 'dossier'
    ? <PaperBack label="DOSSIER" onBack={() => nav.back()} onMore={more} />
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
          {/* ── THE FILING ─────────────────────────────────────────────────
              Each kind is drawn by the component the design drew for it, and
              nothing here re-implements one. An ended filing keeps its room:
              PaperPost prints the tombstone and the critiques below survive,
              which is the entire reason ending is not deleting. */}
          {live.kind === 'dossier' && !ended ? (
            <>
              <EssayHead
                title={live.title ?? ''}
                series={live.seriesTitle ? `Part ${live.partNumber} of ${live.seriesTitle}` : undefined}
                author={author ?? { name: '[deleted]', memberNo: 0, tier: 'free' }}
                readTime={readTimeOf(live.fullContent ?? live.body)}
                filed={formatDateMonthDay(live.createdAt).toUpperCase()}
                film={live.film}
                onAuthor={() => openAuthor(author?.name)}
                onFilm={live.subjectId ? openFilm : undefined}
                // `from` is this part, so the series page marks where the reader
                // already is instead of making them find it.
                onSeries={live.seriesId
                  ? () => nav.push(`/dispatch/series/${live.seriesId}?from=${live.id}`)
                  : undefined}
              />
              <EssayBody text={live.fullContent ?? live.body} />
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
                // The tally comes from the frozen record once there is one, and
                // from nothing before — an open ballot shows no numbers at all
                // until you have marked it, which is the whole engine.
                votes: live.frozenTotals?.counts?.[String(i)] ?? 0,
              }))}
              myVote={myVotes[live.id] ?? null}
              closed={!!live.closesAt && new Date(live.closesAt) <= new Date()}
              closesLabel={live.closesAt ? `closes ${timeAgo(live.closesAt)}` : ''}
              // Whether the result has actually been COUNTED, not merely whether
              // the ballot has closed. Without it every option reads 0 and the
              // page announced NO BALLOTS WERE CAST under a question members had
              // marked — see PaperBallot's own note.
              sealed={!!live.frozenTotals}
              certifyCount={live.certifyCount}
              commentCount={live.commentCount}
              certified={certified}
              saved={saved}
              // ── EVERY ACT IS GATED ON THERE BEING A MEMBER ─────────────────
              // This screen already says a signed-out reader is offered nothing
              // to do TO the filing, and then applied that to the More menu
              // alone. These four were passed unconditionally, and each fails
              // silently without an account: `vote` and `certify` return on
              // their first line, and `setComposing(true)` sets a flag whose
              // composer is itself behind `{me ? …}`. Four controls that looked
              // live and answered a press with nothing.
              // SHARE, the byline and the film stay open to everyone — none of
              // them need an account, and the page is public to read.
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
              order={hourOf(live.createdAt)}
              measureWidth={width}
              certifyCount={live.certifyCount}
              commentCount={live.commentCount}
              certified={certified}
              saved={saved}
              answered={!!live.answerId}
              spoiler={live.spoilerLabel}
              // Only its author can be looking at a withheld filing — the feed
              // excludes them and RLS refuses everyone else — so the plate is
              // telling the one person entitled to know that the house is
              // reading it, rather than that it has gone.
              withheld={!!live.withheldAt}
              ended={live.endedBy ?? undefined}
              edited={!!live.editedAt}
              // Gated on a member, for the reason given on the ballot above.
              onCertify={me ? (next) => useDispatch.getState().certify(live.id, next) : undefined}
              onCritique={me ? () => setComposing(true) : undefined}
              onShare={() => setSharing(true)}
              onSave={me ? (next) => useDispatch.getState().save(live.id, next) : undefined}
              onAuthor={() => openAuthor(author?.name)}
              onFilm={live.subjectId ? openFilm : undefined}
            />
          )}

          {/* ── THE CRITIQUES ──────────────────────────────────────────────
              They survive the filing they sit under, so this is drawn for an
              ended filing too. */}
          {/* Changing the order re-reads from the first page, because the order
              is the server's. Setting the state alone would leave the old
              order's rows on screen under the new label. */}
          <CritiqueHead
            count={live.commentCount}
            order={order}
            onOrder={(o) => {
              if (o === order) return;
              setOrder(o);
              void useDispatch.getState().fetchCritiques(live.id, o);
            }}
          />

          {rows.map((c, i) => (
            <CritiqueRow
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
              // Only the member who asked can take an answer, only on a seeking,
              // and never their own. The control is absent in every other case
              // AND the server refuses it, so hiding a button is not the only
              // thing standing in the way.
              canTake={live.kind === 'seeking' && mine && !ended}
              onTake={() => useDispatch.getState().takeAnswer(live.id, c.id)}
              // Gated like every other act. Without an account `certifyCritique`
              // returns on its first line, so the mark under each critique was
              // live-looking and inert for a signed-out reader.
              onCertify={me ? (next) => useDispatch.getState().certifyCritique(c.id, live.id, next) : undefined}
              onAuthor={() => openAuthor(c.author?.name)}
              onDelete={
                me && c.authorId === me.id
                  ? () => Alert.alert(
                    'Withdraw this critique?',
                    'It comes off the page. This cannot be undone.',
                    [
                      { text: 'Keep it', style: 'cancel' },
                      {
                        text: 'Withdraw',
                        style: 'destructive',
                        onPress: () => {
                          useDispatch.getState().removeCritique(c.id, live.id)
                            .catch(() => reelToast.error('It could not be withdrawn.'));
                        },
                      },
                    ],
                  )
                  : undefined
              }
              onReport={
                // Reportable only when there is somebody to report. A departed
                // member's critique keeps its words and has no account behind
                // it, so the row would open a sheet with nowhere to send.
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
          The composer REPLACES the bar. A signed-out reader gets neither: the
          page is public to read and the acts are not, and a control that
          bounces you to a sign-in you did not ask for is worse than no control. */}
      {me ? (
        composing ? (
          <CritiqueComposer
            me={{
              name: me.username ?? '',
              memberNo: (me as { member_no?: number }).member_no ?? 0,
              tier: 'free',
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
          Mounted only while the share sheet is open on a dossier, and parked at
          a negative offset rather than hidden: `ViewShot` cannot capture a tree
          with `display: none`, and `opacity: 0` on iOS captures as transparent.
          Off the left edge is the one placement that reliably renders and is
          never seen — and it is unmounted the moment the sheet closes, so a page
          a member is only reading never carries it.

          Logo passed as the app's own bundled mark. The house's introduction to
          strangers does not go out with a stand-in glyph. */}
      {sharing && live.kind === 'dossier' ? (
        <View style={{ position: 'absolute', left: -10000, top: 0 }} pointerEvents="none">
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }}>
            <DossierShareCard
              title={live.title ?? ''}
              opening={live.fullContent ?? live.body}
              author={author}
              filed={formatDateMonthDay(live.createdAt).toUpperCase()}
              logo={Image.resolveAssetSource(HOUSE_MARK).uri}
              width={width}
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
            // Blocking removes their filings from every feed, including this
            // one — so staying on a page that is about to be empty would leave
            // the member looking at a filing they just said they did not want.
            nav.back();
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
          The house first, the world second. SAVE THE CARD is offered only for
          a dossier, because the card is an essay's card — a take has nothing
          to set in it, and a row that produces an empty picture is worse than
          a row that is not there. */}
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
        // The Dispatch shares every kind down this one path. The prop names say
        // "dossier" because the message type and its metadata key do, and both
        // have to stay for the messages already sitting in rooms; `dossierKind`
        // is what makes the card say TAKE when it is a take.
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
