/**
 * A FAITHFUL stand-in for FlashList, for the design generators.
 *
 * The crude version (every cell at half width, headers laid out as flex items in
 * the row) drew the Darkroom as two columns with a squeezed 257pt header and
 * posters overhanging the screen — none of which the app does. It asks for THREE
 * columns, and its header spans the page.
 *
 * So: the header and footer span the full width, each cell is exactly
 * 100/numColumns percent of the list, and a horizontal list lays its children in
 * a row. Everything else — padding, aspect ratio, the card itself — comes from
 * the app's own styles, as it should.
 */
import React from 'react';
import { ScrollView, View } from 'react-native';

export function makeFlashListMock() {
  const Mocked = React.forwardRef(function MockFlashList(props: any, ref: any) {
    const data = props.data || [];
    const cols = props.numColumns && props.numColumns > 1 ? props.numColumns : 1;
    const asEl = (C: any) => (!C ? null : React.isValidElement(C) ? C : React.createElement(C));
    const full = { width: '100%' as const };

    const cells = data.map((item: any, index: number) =>
      React.createElement(
        View,
        {
          key: props.keyExtractor ? props.keyExtractor(item, index) : String(index),
          style: cols > 1 ? { width: `${100 / cols}%` } : props.horizontal ? undefined : full,
        },
        props.renderItem ? props.renderItem({ item, index }) : null,
      ),
    );

    const sep = props.ItemSeparatorComponent;
    const withSeps: any[] = [];
    cells.forEach((el: any, i: number) => {
      withSeps.push(el);
      if (sep && cols === 1 && i < cells.length - 1) withSeps.push(React.createElement(sep, { key: 's' + i }));
    });

    const header = asEl(props.ListHeaderComponent);
    const footer = data.length ? asEl(props.ListFooterComponent) : asEl(props.ListEmptyComponent);

    // `contentContainerStyle` wraps the WHOLE list — header, cells and footer.
    // Applying it to the cells alone put the list's top padding (which exists to
    // clear the floating nav bar) BELOW the header, opening a false gap between
    // the Darkroom's heading and its first row of posters.
    const content = React.createElement(
      View,
      { key: 'content', style: [props.contentContainerStyle, props.horizontal ? { flexDirection: 'row' } : null] },
      header ? React.createElement(View, { key: 'h', style: full }, header) : null,
      React.createElement(
        View,
        {
          key: 'b',
          style: [
            full,
            cols > 1 ? { flexDirection: 'row', flexWrap: 'wrap' } : null,
            props.horizontal ? { flexDirection: 'row' } : null,
          ],
        },
        withSeps,
      ),
      footer ? React.createElement(View, { key: 'f', style: full }, footer) : null,
    );
    // FlashList IS a scroll view, either way round, and is drawn as one. A
    // horizontal list, so the design renderer marks it a rail and a measurement
    // knows its far cards are reached by swiping, not cut off at the screen's
    // edge. A vertical one because a scroll view lays its content out with no
    // height limit — drawn as a plain View inside a screen of fixed height,
    // Yoga gave each `flex: 1` cell of the Darkroom's grid its padding alone
    // (8pt, the poster spilling out), where the real list's cells are the
    // poster's height (mockups/tools/yoga-parity.cjs found it). Its own grow
    // and shrink come from the scroll view, as on the phone.
    return props.horizontal
      ? React.createElement(ScrollView, { ref, horizontal: true, style: props.style, showsHorizontalScrollIndicator: false }, content)
      : React.createElement(ScrollView, { ref, style: props.style, showsVerticalScrollIndicator: false }, content);
  });
  return { FlashList: Mocked, FlashListProps: {} };
}
