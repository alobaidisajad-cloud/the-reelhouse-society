/**
 * The helper the screen tests ask "can VoiceOver reach this control?" (test-utils/voiceOver.ts):
 * a control inside an accessibility element is held by it; one beside it, or inside a box set
 * accessible={false}, is not.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { render } from '@testing-library/react-native';
import { actsOffered, stopAround } from '../voiceOver';

it('finds the accessible row a Remove button is drawn inside, and none around a button standing alone', () => {
  const r = render(
    <View>
      <Pressable accessibilityLabel="1. Heat" accessibilityActions={[{ name: 'moveUp', label: 'Move up' }, { name: 'activate' }]} onPress={() => {}}>
        <Pressable accessibilityLabel="Remove Heat" onPress={() => {}} />
      </Pressable>
      <Pressable accessibilityLabel="Add a film" onPress={() => {}} />
      <Pressable accessible={false} onPress={() => {}}>
        <Pressable accessibilityLabel="Open the page" onPress={() => {}} />
      </Pressable>
    </View>,
  );
  const row = stopAround(r.getByLabelText('Remove Heat'));
  expect(row?.props.accessibilityLabel).toBe('1. Heat');
  expect(actsOffered(row!)).toEqual(['Move up', 'activate']);
  expect(stopAround(r.getByLabelText('Add a film'))).toBeNull();
  expect(stopAround(r.getByLabelText('Open the page'))).toBeNull();
});
