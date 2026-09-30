/**
 * The one question before a critique comes off the page — under a log, in a
 * stack, on a filing alike. A critique is a member's words in someone else's
 * room, so it is WITHDRAWN (as a Lounge dispatch is), never deleted; and it
 * cannot be put back, so it is never taken back on a single tap.
 */
import { Alert } from 'react-native';

export const WITHDRAW_TITLE = 'Withdraw this critique?';
export const WITHDRAW_BODY = 'It comes off the page. This cannot be undone.';

export function askToWithdrawCritique(withdraw: () => void): void {
  Alert.alert(WITHDRAW_TITLE, WITHDRAW_BODY, [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Withdraw', style: 'destructive', onPress: withdraw },
  ]);
}
