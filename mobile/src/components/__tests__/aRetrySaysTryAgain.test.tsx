/**
 * aRetrySaysTryAgain.test.tsx — a retry is named by the words it shows, first.
 *
 * Each caller named its TRY AGAIN in its own words ("Ask the archive again"), so a
 * voice-control member saying "tap try again", the words on the button, reached
 * nothing. The name is now made in one place: the shown words, then what is asked for.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import TryAgain, { TryAgainLine, spokenAs } from '../TryAgain';

it('the plate says its words, then what it asks for again', () => {
  expect(render(<TryAgain onPress={() => {}} what="read the critiques" />).getByRole('button').props.accessibilityLabel)
    .toBe('Try again: read the critiques');
  expect(render(<TryAgain onPress={() => {}} />).getByRole('button').props.accessibilityLabel).toBe('Try again');
});

it('a plate with words of its own is named by them', () => {
  expect(render(<TryAgain onPress={() => {}} label="RESTART THE APP" />).getByRole('button').props.accessibilityLabel)
    .toBe('Restart the app');
});

it('the line says the same', () => {
  expect(render(<TryAgainLine onPress={() => {}} what="ask the archive" />).getByRole('button').props.accessibilityLabel)
    .toBe('Try again: ask the archive');
  expect(render(<TryAgainLine onPress={() => {}} />).getByRole('button').props.accessibilityLabel).toBe('Try again');
});

it('spokenAs keeps the shown words whole and in order', () => {
  expect(spokenAs('TRY AGAIN', 'load the screen')).toBe('Try again: load the screen');
  expect(spokenAs('RESTART THE APP')).toBe('Restart the app');
});
