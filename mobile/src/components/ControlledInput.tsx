import React from 'react';
import { TextInput, TextInputProps, View, Text, StyleSheet } from 'react-native';
import { useController, useFormContext } from 'react-hook-form';
import { colors, fonts } from '@/src/theme/theme';

interface ControlledInputProps extends TextInputProps {
  name: string;
}

/**
 * Standard O(1) text input. Only re-renders itself when its value changes,
 * preventing massive full-screen re-renders.
 */
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

/**
 * Bio input with a built-in character counter.
 * The counter isolates its own re-renders so the main screen stays locked at O(1).
 */
export const ControlledBioInput = React.memo(function ControlledBioInput({ name, maxLength = 300, ...props }: ControlledInputProps) {
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

/**
 * Username input with prefix '@' symbol and custom formatting (lowercase, no special chars).
 */
export const ControlledUsernameInput = React.memo(function ControlledUsernameInput({ name, ...props }: ControlledInputProps) {
  const { control } = useFormContext();
  const { field } = useController({ name, control });

  const handleChange = (v: string) => {
    field.onChange(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  };

  return (
    <View style={st.usernameWrap}>
      <Text style={st.usernameAt}>@</Text>
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
    backgroundColor: 'rgba(10,7,3,0.6)',
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
    fontSize: 8,
    letterSpacing: 1,
    color: colors.ash,
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
    backgroundColor: 'rgba(10,7,3,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.1)',
    borderRadius: 3,
    color: colors.parchment,
    fontFamily: fonts.body,
    fontSize: 14,
  },
});
