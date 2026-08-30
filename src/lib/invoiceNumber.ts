/**
 * The next invoice number, from a user-defined pattern.
 *
 * Numbering used to be hardcoded to `YYYY-NNNN`. It then learned to continue
 * whatever the previous invoice used, which covers most cases but cannot be
 * chosen up front — this makes the shape explicit and settable.
 */

export const NUMBER_TOKENS = ["{rok}", "{rr}", "{mm}", "{poradi}"] as const;

export const NUMBER_DEFAULT = "{rok}-{poradi:4}";

const pad = (value: number, width: number) =>
  String(value).padStart(width, "0");

/** Fills a pattern for a given sequence number and date. */
export const formatInvoiceNumber = (
  pattern: string | null | undefined,
  sequence: number,
  date: Date = new Date(),
): string => {
  const source = (pattern ?? "").trim() || NUMBER_DEFAULT;
  const yyyy = String(date.getFullYear());
  return source
    .replace(/\{rok\}/gi, yyyy)
    .replace(/\{rr\}/gi, yyyy.slice(2))
    .replace(/\{mm\}/gi, pad(date.getMonth() + 1, 2))
    .replace(/\{poradi(?::(\d+))?\}/gi, (_, width) =>
      pad(sequence, Number(width ?? 4) || 4),
    );
};

/**
 * The sequence to use next.
 *
 * Counts within the pattern's own prefix, so a pattern containing `{rok}`
 * restarts each year while a plain running number keeps climbing.
 */
export const nextSequence = (
  pattern: string | null | undefined,
  existing: readonly (string | null)[],
  date: Date = new Date(),
): number => {
  const probe = formatInvoiceNumber(pattern, 1, date);
  const marker = formatInvoiceNumber(pattern, 999999, date);
  // Everything the two share is fixed text; the rest is the counter.
  let prefixLength = 0;
  while (
    prefixLength < probe.length &&
    prefixLength < marker.length &&
    probe[prefixLength] === marker[prefixLength]
  ) {
    prefixLength += 1;
  }
  const prefix = probe.slice(0, prefixLength);

  let highest = 0;
  for (const value of existing) {
    const number = value?.trim();
    if (!number || (prefix && !number.startsWith(prefix))) continue;
    const digits = number.slice(prefix.length).match(/^\d+/);
    if (!digits) continue;
    highest = Math.max(highest, Number(digits[0]));
  }
  return highest + 1;
};
