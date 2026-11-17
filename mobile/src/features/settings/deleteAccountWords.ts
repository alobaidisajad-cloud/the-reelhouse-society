/**
 * What deleting an account takes, and what it leaves: the words Settings says before the member
 * confirms, kept in one place so the choice and the warning can never tell two stories.
 *
 * The house (request_account_deletion) destroys the account and everything kept for the member
 * alone. What the member wrote for other members to read (critiques, Dispatch filings, salon
 * messages) stays where it was written with the name taken off, unless the member chooses to erase
 * it as well; then each piece comes down as the member's own withdrawal would take it down. The
 * words below say exactly that, and never call the writing destroyed unless the choice is taken.
 */
import { DEPARTED_NAME } from '@/src/constants/departed';
import { SUPPORT_EMAIL } from '@/src/constants/support';

export const DELETE_TITLE = 'Expunge All Records';

/** What goes, whichever the choice. */
export const DELETE_GOES =
  'Your dossier is destroyed: your profile, your diary with every log and review in it, your stacks, '
  + 'your watchlist, your private notes and your follows. A salon you host passes to the member seated '
  + 'longest; one with no one else seated in it closes.';

/** What stays when the member leaves the choice off, and how to change that later. */
export const DELETE_WORDS_STAY =
  `What you wrote for other members stays where you wrote it, signed “${DEPARTED_NAME}”: your `
  + 'critiques, your Dispatch filings and your salon messages. To take them down too, cancel and turn on '
  + `“Also erase what I wrote”; or write to ${SUPPORT_EMAIL} later, tell us where they are, and the house `
  + 'will erase them.';

/** What happens to the member's writing when they choose to erase it. */
export const DELETE_WORDS_ERASED =
  'What you wrote for other members goes too: your critiques come off the page, your Dispatch filings '
  + 'read “withdrawn by its author” and your salon messages read “dispatch withdrawn”. What others '
  + 'wrote in reply stays.';

export const DELETE_FINAL = 'This cannot be undone.';

/** The choice itself, as the row names it and as a screen reader says it. */
export const ERASE_CHOICE_LABEL = 'Also erase what I wrote';
export const ERASE_CHOICE_DESC =
  'When you delete your account, your critiques, filings and salon messages are taken down with it. '
  + `Left off, they stay where you wrote them, signed “${DEPARTED_NAME}”.`;

/** The whole warning before DELETE, for the choice the member has made. */
export function deleteAccountMessage({ eraseWriting, paying }: { eraseWriting: boolean; paying: string }): string {
  return [
    DELETE_GOES,
    eraseWriting ? DELETE_WORDS_ERASED : DELETE_WORDS_STAY,
    `${DELETE_FINAL}${paying}`,
  ].join('\n\n');
}
