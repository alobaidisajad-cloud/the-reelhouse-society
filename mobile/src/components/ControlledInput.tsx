import React from 'react';
import { TextInputProps, View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { useController, useFormContext } from 'react-hook-form';
import { colors, fonts } from '@/src/theme/theme';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

interface ControlledInputProps extends TextInputProps {
  name: string;
  /** Required: a field is found and named by a screen reader through this alone. */
  accessibilityLabel: string;
}

/** A form field bound to the form by name: typing redraws this field, not the screen. */
export const ControlledInput = React.memo(function ControlledInput({ name, style, ...props }: ControlledInputProps) {
  const { control } = useFormContext();
  const { field } = useController({ name, control });

  return (
    <TextInput
      style={style}
      value={field.value}
      onChangeText={field.onChange}
      selectionColor={colors.selection}
      {...props}
    />
  );
});

/** The bio, with its count of characters beside it (redrawn with the field alone). */
export const ControlledBioInput = React.memo(function ControlledBioInput({ name, maxLength = MAX_LENGTHS.bio, ...props }: ControlledInputProps) {
  const { control } = useFormContext();
  const { field } = useController({ name, control });

  return (
    <>
      <TextInput
        style={st.bioInput}
        value={field.value}
        onChangeText={field.onChange}
        multiline
        maxLength={maxLength}
        selectionColor={colors.selection}
        {...props}
      />
      <Text style={st.charCount}>{(field.value || '').length}/{maxLength}</Text>
    </>
  );
});

/** The handle, after a drawn '@': what is typed is kept to lowercase letters, digits and underscores. */
export const ControlledUsernameInput = React.memo(function ControlledUsernameInput({ name, ...props }: ControlledInputProps) {
  const { control } = useFormContext();
  const { field } = useController({ name, control });

  const handleChange = (v: string) => {
    field.onChange(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  };

  return (
    <View style={st.usernameWrap}>
      {/* Drawn, not spoken: the field's own name says what it holds. */}
      <Text style={st.usernameAt} accessibilityElementsHidden importantForAccessibility="no">@</Text>
      <TextInput
        style={st.usernameInput}
        value={field.value}
        onChangeText={handleChange}
        autoCapitalize="none"
        autoCorrect={false}
        selectionColor={colors.selection}
        {...props}
      />
    </View>
  );
});

const st = StyleSheet.create({
  bioInput: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.well,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.1)',
    borderRadius: 3,
    color: colors.parchment,
    fontFamily: fonts.body,
    fontSize: 14,
    height: 90,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  charCount: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.fogQuiet,
    textAlign: 'right',
    marginTop: 4,
  },
  usernameWrap: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  usernameAt: {
    position: 'absolute',
    left: 14,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.fog,
    zIndex: 2,
  },
  usernameInput: {
    paddingLeft: 32,
    width: '100%',
    paddingRight: 14,
    paddingVertical: 11,
    backgroundColor: colors.well,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.1)',
    borderRadius: 3,
    color: colors.parchment,
    fontFamily: fonts.body,
    fontSize: 14,
  },
});
