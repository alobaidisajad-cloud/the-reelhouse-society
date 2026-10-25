/**
 * FilingRow — one filing in a list: the feed, a member's room, a film's archive.
 *
 * The three lists drew the same card with their own copy of its thirty props,
 * and handed it handlers made anew for every row on every render — so a certify
 * on one filing redrew every filing on the page (the feed was fixed alone, and
 * measured; the room and the archive were not). The archive also moved the
 * heart on a certify and left the number beside it where it was.
 *
 * One row, memoised on plain values: what differs between the lists (the
 * margin, the film's art, the byline, the count's live correction) comes in as
 * props, and the handlers are made here, so a change to one filing redraws that
 * filing alone.
 */
import { memo, useCallback } from 'react';

import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { roomOf } from '@/src/components/dispatch/roomLink';
import { partOf } from '@/src/components/dispatch/paper/paperText';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';
import { nav } from '@/src/utils/typedRouter';

export const FilingRow = memo(function FilingRow({
  f, width, order, orderIs, certified, saved, member,
  pending = false, shift = 0, noByline = false, withFilm = true, toAuthor = true,
}: {
  f: Filing;
  width: number;
  /** What the margin prints, and what it is (spoken accordingly). */
  order: string;
  orderIs: 'hour' | 'count' | 'day';
  certified: boolean;
  saved: boolean;
  /** Signed in: the marks are theirs to move. */
  member: boolean;
  /** Written on this phone and not yet sent. */
  pending?: boolean;
  /**
   * The member's own live mark, for a list that holds its own copy of the
   * filings (a room, an archive): +1 or −1 against the count it was read with.
   */
  shift?: number;
  /** The page is this member's: no byline on each entry. */
  noByline?: boolean;
  /** The page is this film's: no poster on each entry. */
  withFilm?: boolean;
  /** The byline opens the member's room (not on the room itself). */
  toAuthor?: boolean;
}) {
  // Whether this member's marks on this filing have been read: a signed-out reader has none to read.
  const certifyKnown = useDispatch((s) => !member || s.marksKnown.certified.has(f.id));
  const saveKnown = useDispatch((s) => !member || s.marksKnown.saved.has(f.id));
  // Kept across the row's redraws, so its marks being read redraw the bar and not the words.
  const id = f.id;
  const subjectId = withFilm ? f.subjectId : null;
  const authorName = toAuthor ? f.author?.name : undefined;
  const open = useCallback(() => nav.push(`/dispatch/${id}`), [id]);
  const certify = useCallback((next: boolean) => useDispatch.getState().certify(id, next), [id]);
  const save = useCallback((next: boolean) => useDispatch.getState().save(id, next), [id]);
  const toFilm = useCallback(() => nav.push(`/film/${subjectId}`), [subjectId]);
  const toRoom = useCallback(() => { if (authorName) nav.push(roomOf(authorName)); }, [authorName]);
  return (
    <PaperPost
      kind={f.kind}
      author={f.author}
      noByline={noByline}
      body={f.kind === 'dossier' ? (f.title ?? f.body) : f.body}
      source={f.source ?? undefined}
      film={withFilm ? f.film : null}
      order={order}
      orderIs={orderIs}
      measureWidth={width}
      certifyCount={Math.max(0, f.certifyCount + shift)}
      commentCount={f.commentCount}
      certified={certified}
      saved={saved}
      certifyKnown={certifyKnown}
      saveKnown={saveKnown}
      answered={!!f.answerId}
      spoiler={f.spoilerLabel}
      withheld={!!f.withheldAt}
      ended={f.endedBy ?? undefined}
      edited={!!f.editedAt}
      series={f.seriesTitle ? partOf(f.partNumber, f.seriesTitle).printed : undefined}
      pending={pending}
      onOpen={open}
      onCritique={open}
      onCertify={member ? certify : undefined}
      onSave={member ? save : undefined}
      // Share opens the reader, where the sheet has room.
      onShare={open}
      onFilm={subjectId ? toFilm : undefined}
      onAuthor={authorName ? toRoom : undefined}
    />
  );
});
