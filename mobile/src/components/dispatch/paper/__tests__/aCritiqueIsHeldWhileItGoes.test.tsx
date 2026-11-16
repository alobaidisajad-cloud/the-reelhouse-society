/**
 * aCritiqueIsHeldWhileItGoes.test.tsx — review round 6
 *
 * A critique is sent as it stood at FILE, and the field is emptied as it lands. Words written while
 * it went were wiped with it, never sent. The field is held while it goes, and free again after.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { CritiqueComposer } from '../PaperCritiques';

const ME = { name: 'kane', memberNo: 42, tier: 'auteur', avatar: null } as never;

it('the critique cannot be written in while it is being sent, and can again once it has gone', async () => {
  const sending = await render(<CritiqueComposer me={ME} value="Patient, not slow." sending />);
  expect(sending.getByLabelText('Your critique').props.editable).toBe(false);
  sending.unmount();

  const idle = await render(<CritiqueComposer me={ME} value="Patient, not slow." sending={false} />);
  expect(idle.getByLabelText('Your critique').props.editable).not.toBe(false);
});
