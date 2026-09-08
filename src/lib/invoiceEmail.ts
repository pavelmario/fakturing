/**
 * The covering e-mail an invoice goes out with.
 *
 * The app never sends anything itself: it fills a template and hands the
 * draft to whatever mail client the machine already has, so the message is
 * still read and pressed by a person. That also keeps the app free of an
 * outbound account, a server and everything that comes with one.
 */

export const EMAIL_TOKENS = [
  "{cislo}",
  "{klient}",
  "{castka}",
  "{splatnost}",
  "{datum}",
  "{dodavatel}",
  "{vs}",
] as const;

export type EmailVars = {
  /** The invoice number as printed. */
  cislo: string;
  klient: string;
  /** Already formatted with its currency — the mail is text, not arithmetic. */
  castka: string;
  splatnost: string;
  datum: string;
  dodavatel: string;
  /** The variable symbol: the number's digits, which is what a bank takes. */
  vs: string;
};

/** The variable symbol a Czech bank transfer carries: digits only. */
export const variableSymbol = (invoiceNumber: string): string =>
  invoiceNumber.replace(/\D/g, "");

export const fillEmailTemplate = (
  template: string,
  vars: EmailVars,
): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key)
      ? String(vars[key as keyof EmailVars])
      : match,
  );

/**
 * A `mailto:` the operating system will open.
 *
 * The address goes in the path and the rest in the query, each encoded on its
 * own: a subject with a `&` in it silently truncated the body otherwise.
 */
export const buildMailto = (
  to: string,
  subject: string,
  body: string,
): string => {
  const query = [
    subject.trim() ? `subject=${encodeURIComponent(subject)}` : "",
    body.trim() ? `body=${encodeURIComponent(body)}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const address = to.trim() ? encodeURIComponent(to.trim()).replace(/%40/g, "@") : "";
  return `mailto:${address}${query ? `?${query}` : ""}`;
};

/**
 * The wording to use: the client's own, then the profile's, then the
 * app's — the subject and the body are chosen separately, so a client that
 * only overrides the subject keeps the standard body.
 */
export const pickTemplate = (
  clientValue: string | null | undefined,
  profileValue: string | null | undefined,
  fallback: string,
): string => clientValue?.trim() || profileValue?.trim() || fallback;
