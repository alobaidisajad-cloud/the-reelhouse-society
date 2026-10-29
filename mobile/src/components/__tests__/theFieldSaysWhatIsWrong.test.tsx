/**
 * theFieldSaysWhatIsWrong.test.tsx — FieldError, focusField and useFieldRefusal, on their own.
 *
 * The forms that use them are tested where they live; these hold each piece to
 * its word, the cases no form hands it among them: no message, no field yet.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, renderHook, act } from '@testing-library/react-native';
import { FieldError, focusField, useFieldRefusal } from '../FieldError';
import type { TextInput } from '@/src/components/text';

beforeEach(() => { jest.mocked(AccessibilityInfo.sendAccessibilityEvent).mockClear(); });

it('draws the message, and nothing at all without one', () => {
  expect(render(<FieldError message="Give the link a title." />).getByText('Give the link a title.')).toBeTruthy();
  expect(render(<FieldError message={null} />).toJSON()).toBeNull();
  expect(render(<FieldError message="" />).toJSON()).toBeNull();
});

it('focusField opens the keyboard there and moves a screen reader there; with no field, does nothing', () => {
  const input = { focus: jest.fn() } as unknown as TextInput;
  focusField(input);
  expect((input as unknown as { focus: jest.Mock }).focus).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(input, 'focus');
  focusField(null);
  focusField(undefined);
  expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledTimes(1);
});

it('a refusal stands for its field until the form changes, and sends the member to it', async () => {
  const field = { focus: jest.fn() } as unknown as TextInput;
  const { result, rerender } = await renderHook(
    ({ value }: { value: string }) => useFieldRefusal([value], { title: { current: field }, body: { current: null } }),
    { initialProps: { value: '' } },
  );
  expect(result.current.wrongWith('title')).toBeUndefined();
  await act(async () => { result.current.refuse('title', 'Name it.'); });
  expect(result.current.wrongWith('title')).toBe('Name it.');
  expect(result.current.wrongWith('body')).toBeUndefined();
  expect((field as unknown as { focus: jest.Mock }).focus).toHaveBeenCalledTimes(1);
  await rerender({ value: 'Rain' });
  expect(result.current.wrongWith('title')).toBeUndefined();
  // A field not yet drawn: the reason stands; there is nowhere to send the member.
  await act(async () => { result.current.refuse('body', 'Write something.'); });
  expect(result.current.wrongWith('body')).toBe('Write something.');
});
