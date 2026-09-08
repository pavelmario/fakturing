/**
 * Inserting a template token where the caret is.
 *
 * The token buttons used to append to the end of the field, so with the caret
 * in the middle of a pattern — the usual place, since you build these by
 * typing the separators and clicking the tokens — the token landed after
 * everything you had typed rather than where you were.
 */

type Field = HTMLInputElement | HTMLTextAreaElement | null | undefined;

export const insertAtCaret = (
  field: Field,
  value: string,
  token: string,
): { next: string; caret: number } => {
  /* A field that was never focused reports a caret at 0, which would insert
     the token in front of the pattern; only an active field has a caret to
     honour, everything else appends. */
  const active =
    field && typeof document !== "undefined" && document.activeElement === field;
  const start = active ? (field.selectionStart ?? value.length) : value.length;
  const end = active ? (field.selectionEnd ?? start) : value.length;
  return {
    next: `${value.slice(0, start)}${token}${value.slice(end)}`,
    caret: start + token.length,
  };
};

/**
 * Inserts the token and leaves the caret behind it, ready to keep typing.
 *
 * The caret is restored on the next frame: React has written the new value to
 * the DOM by then, and setting the selection before that puts it back where
 * the browser left it — the end of the old text.
 */
export const insertToken = (
  field: Field,
  value: string,
  token: string,
  onChange: (next: string) => void,
): void => {
  const { next, caret } = insertAtCaret(field, value, token);
  onChange(next);
  if (!field) return;
  requestAnimationFrame(() => {
    field.focus();
    field.setSelectionRange(caret, caret);
  });
};
