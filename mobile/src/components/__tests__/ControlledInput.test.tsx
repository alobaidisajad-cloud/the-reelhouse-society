/**
 * ControlledInput.test.tsx — renders the REAL components.
 *
 * The previous version rendered a bare TextInput and tested React Native
 * itself, with a comment conceding "if ControlledInput exports a standalone
 * component, import it directly" — it does, and always did.
 *
 * These are the fields a member edits their identity through, and the username
 * variant SANITISES what they type, which is a rule worth binding to the real
 * component rather than to a description of it.
 *
 * Component rendering works in this environment (see AuthGuard.test.tsx); it is
 * renderHook that does not.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useForm, FormProvider } from 'react-hook-form';
import { ControlledInput, ControlledBioInput, ControlledUsernameInput } from '../ControlledInput';

/** Wraps a field in the real form context it reads from. */
function Harness({ children, defaultValues = {} }: { children: React.ReactNode; defaultValues?: Record<string, unknown> }) {
  const methods = useForm({ defaultValues });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

describe('ControlledInput', () => {
  it('shows the current form value', () => {
    const { getByDisplayValue } = render(
      <Harness defaultValues={{ displayName: 'Sajad' }}>
        <ControlledInput name="displayName" />
      </Harness>,
    );
    expect(getByDisplayValue('Sajad')).toBeTruthy();
  });

  it('writes typing back into the form', async () => {
    const { getByTestId, getByDisplayValue } = render(
      <Harness defaultValues={{ displayName: '' }}>
        <ControlledInput name="displayName" testID="f" />
      </Harness>,
    );
    fireEvent.changeText(getByTestId('f'), 'Kurosawa');
    await waitFor(() => expect(getByDisplayValue('Kurosawa')).toBeTruthy());
  });

  it('passes accessibility props through to the input', () => {
    const { getByLabelText } = render(
      <Harness defaultValues={{ displayName: '' }}>
        <ControlledInput name="displayName" accessibilityLabel="Display name" />
      </Harness>,
    );
    expect(getByLabelText('Display name')).toBeTruthy();
  });
});

describe('ControlledBioInput', () => {
  it('counts the characters actually entered', () => {
    const { getByText } = render(
      <Harness defaultValues={{ bio: 'Noir' }}>
        <ControlledBioInput name="bio" />
      </Harness>,
    );
    expect(getByText('4/300')).toBeTruthy();
  });

  it('shows 0 for an empty bio rather than crashing on undefined', () => {
    const { getByText } = render(
      <Harness defaultValues={{}}>
        <ControlledBioInput name="bio" />
      </Harness>,
    );
    expect(getByText('0/300')).toBeTruthy();
  });

  it('the counter follows what is typed', async () => {
    const { getByTestId, getByText } = render(
      <Harness defaultValues={{ bio: '' }}>
        <ControlledBioInput name="bio" testID="bio" />
      </Harness>,
    );
    fireEvent.changeText(getByTestId('bio'), 'Twelve chars');
    await waitFor(() => expect(getByText('12/300')).toBeTruthy());
  });
});

describe('ControlledUsernameInput — sanitises as you type', () => {
  /** Types `raw` and resolves with what the field actually holds afterwards. */
  const typeUsername = async (raw: string) => {
    const r = render(
      <Harness defaultValues={{ username: '' }}>
        <ControlledUsernameInput name="username" testID="u" />
      </Harness>,
    );
    fireEvent.changeText(r.getByTestId('u'), raw);
    // react-hook-form commits the change on a later tick, so the re-render has
    // to be awaited — asserting immediately reads the pre-update value.
    await waitFor(() => expect(r.getByTestId('u').props.value).not.toBe(''));
    return r.getByTestId('u').props.value as string;
  };

  it('forces lowercase', async () => {
    expect(await typeUsername('SAJAD')).toBe('sajad');
  });

  it('strips characters a username may not contain', async () => {
    // Removed rather than rejected, so the field cannot hold a value the
    // server would refuse.
    expect(await typeUsername('a b!c@d.e')).toBe('abcde');
  });

  it('keeps letters, digits and underscores', async () => {
    expect(await typeUsername('film_buff_99')).toBe('film_buff_99');
  });

  it('strips accents and emoji', async () => {
    expect(await typeUsername('héllo🎬')).toBe('hllo');
  });

  it('renders the @ prefix', () => {
    const { getByText } = render(
      <Harness defaultValues={{ username: 'x' }}>
        <ControlledUsernameInput name="username" />
      </Harness>,
    );
    expect(getByText('@')).toBeTruthy();
  });
});
