/**
 * The exported PDF's filename, from a user-defined template.
 *
 * Used to be a choice between two hardcoded shapes, one of which produced
 * `jannovak-2026-0007.pdf` because the year already lives inside the invoice
 * number. It is now a template of tokens the user composes.
 */

export const FILENAME_TOKENS = [
  "{cislo}",
  "{klient}",
  "{dodavatel}",
  "{rok}",
  "{rrmmdd}",
  "{rrrrmmdd}",
] as const;

export const FILENAME_DEFAULT = "faktura-{cislo}";

export type FileNameParts = {
  number: string;
  client: string;
  supplier: string;
  /** The invoice's issue date — date tokens are derived from it. */
  issueDate?: Date | null;
};

/**
 * A token's value, folded to lowercase ASCII.
 *
 * Spaces and punctuation are *removed*, not hyphenated, so "Jan Šetina"
 * becomes `jansetina` — the separators in a filename should be the ones you
 * typed in the template, not ones invented inside a value. Hyphens survive,
 * because invoice numbers legitimately contain them (`2026-0007`).
 */
const compact = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "");

/** Keeps the template's own separators; drops anything unsafe for a file. */
const sanitize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

/** Back-compat: the two legacy preset values map onto templates. */
export const normalizeFileNameTemplate = (
  stored: string | null | undefined,
): string => {
  if (stored === "invoice-year-invoice_number") return FILENAME_DEFAULT;
  if (stored === "name-year-invoice_number") return "{dodavatel}-{cislo}";
  return stored ?? FILENAME_DEFAULT;
};

const pad = (value: number) => String(value).padStart(2, "0");

export const buildInvoiceFileName = (
  template: string | null | undefined,
  parts: FileNameParts,
): string => {
  /* Normalised here rather than at the call sites: a legacy profile stores a
     preset name, not a template, and one forgotten call exported every PDF
     as "invoice-year-invoice_number.pdf". */
  const pattern =
    normalizeFileNameTemplate(template).trim() || FILENAME_DEFAULT;
  const date =
    parts.issueDate && !Number.isNaN(parts.issueDate.getTime())
      ? parts.issueDate
      : new Date();
  const yyyy = String(date.getFullYear());
  const mmdd = `${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const filled = pattern
    .replace(/\{cislo\}/gi, compact(parts.number))
    .replace(/\{klient\}/gi, compact(parts.client))
    .replace(/\{dodavatel\}/gi, compact(parts.supplier))
    .replace(/\{rrrrmmdd\}/gi, `${yyyy}${mmdd}`)
    .replace(/\{rrmmdd\}/gi, `${yyyy.slice(2)}${mmdd}`)
    .replace(/\{rok\}/gi, yyyy);
  const name = sanitize(filled) || compact(parts.number) || "faktura";
  return `${name}.pdf`;
};

