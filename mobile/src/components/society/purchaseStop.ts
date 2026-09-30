/**
 * purchaseStop — why a purchase did not go through, said the way the member
 * needs to hear it.
 *
 * The store answers a purchase that did not complete with a code, and each
 * code asks something different of the member. A payment waiting for a
 * parent's or a bank's approval will still complete, on its own. A rank this
 * store account already holds is brought to this phone by RESTORE. No
 * connection is a matter of trying again. All of them used to read "Checkout
 * is unavailable", which was untrue of the first two.
 *
 * A member cancelling is not here: purchaseTier answers null for that, and
 * the page says nothing, because nothing needs saying.
 *
 * The codes are the store library's own (react-native-purchases' error codes).
 */
import { STORE } from './SmallPrint';

const NOT_ALLOWED = '3';
const ALREADY_HELD = '6';
const NO_CONNECTION = '10';
const PAYMENT_PENDING = '20';

export interface PurchaseStop {
  /** `info` when nothing went wrong: the purchase is waiting, or already held. */
  tone: 'info' | 'error';
  text: string;
}

/** `notSetUp` is the page's own sentence for a rank the store does not sell yet. */
export function purchaseStop(err: unknown, notSetUp: string): PurchaseStop {
  if (err instanceof Error && err.message.includes('No package found')) return { tone: 'error', text: notSetUp };
  switch (String((err as { code?: unknown } | null)?.code ?? '')) {
    case PAYMENT_PENDING:
      return { tone: 'info', text: `Your payment is waiting for approval. Your rank arrives once ${STORE.name} confirms it.` };
    case ALREADY_HELD:
      return { tone: 'info', text: `Your ${STORE.account} already holds this membership. Tap RESTORE to bring it here.` };
    case NO_CONNECTION:
      return { tone: 'error', text: `Couldn't reach ${STORE.name}. Check your connection and try again.` };
    case NOT_ALLOWED:
      return { tone: 'error', text: 'Purchases are turned off on this device.' };
    default:
      return { tone: 'error', text: `Checkout is unavailable. Please check your ${STORE.name === 'Google Play' ? 'Google Play' : 'App Store'} account.` };
  }
}
