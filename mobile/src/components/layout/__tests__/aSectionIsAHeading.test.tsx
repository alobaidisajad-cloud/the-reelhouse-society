/**
 * aSectionIsAHeading.test.tsx — a section's title is announced as a heading.
 *
 * Settings and the Edit Profile desk are long pages of cards, each under a
 * title ("IMPORT & EXPORT", "THE FRONT DESK"). Untagged, a screen reader could
 * only read on line by line; tagged, it moves section by section.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Users } from 'lucide-react-native';
import { SectionHead } from '../SectionCards';
import { SectionHead as SettingsSectionHead } from '@/src/features/settings/SettingsSections';

it.each([
  ['the Edit Profile desk', SectionHead],
  ['Settings', SettingsSectionHead],
])('%s', (_where, Head) => {
  const r = render(<Head icon={Users} label="IMPORT & EXPORT" />);
  expect(r.getByText('IMPORT & EXPORT').props.accessibilityRole).toBe('header');
});
