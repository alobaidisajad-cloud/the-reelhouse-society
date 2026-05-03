/**
 * F-07 NOTE: This is an intentional deep-link redirect alias.
 * Push notifications and external deep links may target `/lounge` directly.
 * This file redirects to the tab-based route at `/(tabs)/lounge`.
 * Do NOT delete — it's required for navigation integrity.
 */
import { Redirect } from 'expo-router';

export default function LoungeRedirectAlias() {
  return <Redirect href="/(tabs)/lounge" />;
}
