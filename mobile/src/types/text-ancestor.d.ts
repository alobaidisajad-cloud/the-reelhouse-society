/**
 * React Native's own context saying a Text stands inside another (its Text reads it the same
 * way), which ships with no types. The app's Text reads it (src/components/text): a Text inside
 * another has no box of its own to be cut in.
 */
declare module 'react-native/Libraries/Text/TextAncestorContext' {
  import type { Context } from 'react';

  const TextAncestorContext: Context<boolean>;
  export default TextAncestorContext;
}
