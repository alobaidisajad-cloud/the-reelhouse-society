/**
 * A FAITHFUL stand-in for FlashList, for the design generators: the header and
 * footer span the full width, each cell is exactly 100/numColumns percent of the
 * list, and a horizontal list lays its children in a row. Everything else (padding,
 * aspect ratio, the card itself) comes from the app's own styles.
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
        // As FlashList's ViewHolder: a row is handed the list's extraData, and a row that reads it must see it.
        props.renderItem ? props.renderItem({ item, index, extraData: props.extraData, target: 'Cell' }) : null,
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
    // A scroll view, as FlashList is: a rail's far cards are reached by swiping, and a
    // vertical list's content has no height limit (a plain View shrank its cells).
    return props.horizontal
      ? React.createElement(ScrollView, { ref, horizontal: true, style: props.style, showsHorizontalScrollIndicator: false }, content)
      : React.createElement(ScrollView, { ref, style: props.style, showsVerticalScrollIndicator: false }, content);
  });
  return { FlashList: Mocked, FlashListProps: {} };
}
