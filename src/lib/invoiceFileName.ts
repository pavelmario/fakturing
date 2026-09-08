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
  /** What the client itself asks to be called in a filename, if anything. */
  clientAlias?: string | null;
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

/**
 * An invoice number, made safe for a file without changing what it says.
 *
 * `compact` is right for a name — "Jan Šetina" belongs in a filename as
 * `jansetina` — and wrong for a number: a Czech invoice is as often numbered
 * `2026/001` as `2026-001`, and deleting the slash printed `2026001`, a
 * number that appears on no invoice. The separator is kept, as a hyphen.
 */
const compactNumber = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Keeps the template's own separators; drops anything unsafe for a file. */
const sanitize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

/** What `{klient}` becomes when the client has not chosen its own spelling. */
export const defaultClientAlias = (name: string): string => compact(name);

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
  /* The alias is typed by hand, so it keeps its own shape — "AlzaCZ" was
     capitalised on purpose. Only the derived default is folded down. */
  const alias = parts.clientAlias?.trim();
  const filled = pattern
    .replace(/\{cislo\}/gi, compactNumber(parts.number))
    .replace(/\{klient\}/gi, alias ? sanitize(alias) : compact(parts.client))
    .replace(/\{dodavatel\}/gi, compact(parts.supplier))
    .replace(/\{rrrrmmdd\}/gi, `${yyyy}${mmdd}`)
    .replace(/\{rrmmdd\}/gi, `${yyyy.slice(2)}${mmdd}`)
    .replace(/\{rok\}/gi, yyyy);
  const name = sanitize(filled) || compactNumber(parts.number) || "faktura";
  return `${name}.pdf`;
};

