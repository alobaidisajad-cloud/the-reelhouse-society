/**
 * The reader's docked action bar: each count beside its mark, the word alone.
 * ─────────────────────────────────────────────────────────────────────────────
 * `CERTIFIED 2.1K` was fourteen characters in a quarter that is 72pt on a
 * 320pt phone. At the type floor (10pt) and the largest text size it did not
 * fit even at the smallest shrink, and ended in "…" — the count, the one thing
 * the member was reading it for, was the part that was cut.
 *
 * The count moved up beside the icon, where the line has room to spare, and
 * the word under it is now the card's own word (`CERTIFIED`, not
 * `CERTIFIED 2.1K`), so the dock and the card say the same thing.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { PostDock } from '@/src/components/dispatch/paper/PaperCritiques';
import { p } from '@/src/components/dispatch/paper/paperStyles';

const texts = (r: ReturnType<typeof render>) => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n === 'string') return;
    if (n.type === 'Text') out.push([n.children].flat(3).filter((c: unknown) => typeof c === 'string').join(''));
    (n.children ?? []).forEach(walk);
  };
  walk(r.toJSON());
  return out;
};

describe('the dock', () => {
  it('sets each count beside its mark, and the word alone beneath', () => {
    const r = render(<PostDock certifyCount={2140} commentCount={5218} certified onCertify={jest.fn()} onSave={jest.fn()} />);
    const t = texts(r);
    expect(t).toEqual(expect.arrayContaining(['2.1K', 'CERTIFIED', '5.2K', 'CRITIQUE', 'SHARE', 'SAVE']));
    // no label carries its count any more
    expect(t.some((s) => /CERTIF\w* \d|CRITIQUE \d/.test(s))).toBe(false);
  });

  it('puts the count in the same row as the icon, not under the word', () => {
    const r = render(<PostDock certifyCount={2140} commentCount={5218} onCertify={jest.fn()} onSave={jest.fn()} />);
    for (const figure of ['2.1K', '5.2K']) {
      let row: any = r.getByText(figure).parent;
      while (row && row.props?.style !== p.dockFigure) row = row.parent;
      expect({ figure, inTheIconRow: !!row }).toEqual({ figure, inTheIconRow: true });
    }
    // and that row is exactly as tall as the icon, so the dock keeps its height
    expect(p.dockFigure.height).toBe(16);
  });

  it('shows no count when there is none — the row is the icon alone', () => {
    const r = render(<PostDock certifyCount={0} commentCount={0} onCertify={jest.fn()} onSave={jest.fn()} />);
    const t = texts(r);
    expect(t).toEqual(['CERTIFY', 'CRITIQUE', 'SHARE', 'SAVE']);
  });
});
