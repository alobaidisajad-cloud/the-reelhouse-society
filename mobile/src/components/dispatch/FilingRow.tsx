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
import { memo } from 'react';

import { PaperPost } from '@/src/components/dispatch/paper/PaperPost';
import { roomOf } from '@/src/components/dispatch/roomLink';
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
      answered={!!f.answerId}
      spoiler={f.spoilerLabel}
      withheld={!!f.withheldAt}
      ended={f.endedBy ?? undefined}
      edited={!!f.editedAt}
      series={f.seriesTitle ? `Part ${f.partNumber} of ${f.seriesTitle}` : undefined}
      pending={pending}
      onOpen={() => nav.push(`/dispatch/${f.id}`)}
      onCritique={() => nav.push(`/dispatch/${f.id}`)}
      onCertify={member ? (next) => useDispatch.getState().certify(f.id, next) : undefined}
      onSave={member ? (next) => useDispatch.getState().save(f.id, next) : undefined}
      // Share opens the reader, where the sheet has room.
      onShare={() => nav.push(`/dispatch/${f.id}`)}
      onFilm={withFilm && f.subjectId ? () => nav.push(`/film/${f.subjectId}`) : undefined}
      onAuthor={toAuthor && f.author ? () => nav.push(roomOf(f.author!.name)) : undefined}
    />
  );
});
