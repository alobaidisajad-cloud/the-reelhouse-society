/**
 * aPageUnderASheetIsUnspoken.test.tsx — UnderSheet, on its own.
 *
 * Every page a sheet that is not a Modal opens over (the essay, the take, the ballot desk, the
 * reader, a stack) is held in it: while the sheet is up the page is drawn, and out of a screen
 * reader's reach; closed, it is back. That each page is held is the captures' BENEATH check.
 */
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { UnderSheet } from '../UnderSheet';

const page = (open: boolean) => render(<UnderSheet open={open}><Text>The page</Text></UnderSheet>);

it('closed, the page is read', () => {
  expect(page(false).getByText('The page')).toBeTruthy();
});

it('open, the page is drawn but out of a screen reader\'s reach, on both platforms', () => {
  const r = page(true);
  expect(r.queryByText('The page')).toBeNull();
  let held = r.getByText('The page', { includeHiddenElements: true }) as { parent: unknown; props: Record<string, unknown> } | null;
  while (held && held.props.accessibilityElementsHidden === undefined) held = held.parent as typeof held;
  expect(held?.props.accessibilityElementsHidden).toBe(true);
  expect(held?.props.importantForAccessibility).toBe('no-hide-descendants');
});
