/**
 * instant.ts — an instant written as text, read one way on every engine (WORKLIST P4.52).
 * ─────────────────────────────────────────────────────────────────────────────
 * The house writes its instants as Postgres does, `2026-11-06T10:00:00.123456+00:00`:
 * six places after the second, where the spec's form has three, and an offset that
 * may come as `+00`. What Date.parse makes of a form outside the spec is the
 * engine's own choice, and the phone's engine is not Node's. So the house's form is
 * brought to the spec's (the places past the third cut, as a Date cannot hold them;
 * the offset given its minutes; a space taken for the T) before it is read. Any
 * other text, such as an answer's HTTP `Date` header (the form toUTCString writes,
 * which Date.parse must read back), is read as it is.
 *
 * ESLint lets Date.parse be called here alone; the tests run on Hermes as well
 * (scripts/hermes-suites.cjs).
 */
const HOUSE_FORM = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** The milliseconds since 1970 the text names, or NaN when it names none. */
export function instantOf(text: string | null | undefined): number {
  if (!text) return NaN;
  const trimmed = text.trim();
  const house = HOUSE_FORM.exec(trimmed);
  if (!house) return Date.parse(trimmed);
  const [, day, time, places, zone] = house;
  const fraction = places ? `.${places.slice(0, 3).padEnd(3, '0')}` : '';
  const offset = !zone ? ''
    : zone.toUpperCase() === 'Z' ? 'Z'
      : zone.length === 3 ? `${zone}:00`
        : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  return Date.parse(`${day}T${time}${fraction}${offset}`);
}
