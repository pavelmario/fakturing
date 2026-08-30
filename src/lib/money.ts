/**
 * Every amount in the app is formatted through here.
 *
 * Each invoice carries its own currency and amounts are never converted, so
 * totals are only ever summed within one currency — see `sumByCurrency`.
 */

export const DEFAULT_CURRENCY = "CZK";

/** Currencies offered in the picker; anything stored is still respected. */
export const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "PLN"] as const;

/** The Czech SPD payment QR encodes CZK only. */
export const supportsCzechQr = (currency: string | null | undefined) =>
  (currency ?? DEFAULT_CURRENCY) === "CZK";

/** Amount without the currency mark — for table columns that carry the
 *  currency in the header rather than repeating it on every row. */
export const formatAmount = (value: number, locale: string): string => {
  if (!Number.isFinite(value)) value = 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Intl throws a RangeError on anything that is not a well-formed ISO 4217
 * code, which would take down every screen that states an amount — and a bad
 * code is *stored*, so the ledger would stay broken across reloads. An
 * unrecognised code is printed beside the number instead.
 */
export const isCurrencyCode = (currency: string): boolean => {
  try {
    new Intl.NumberFormat("en", { style: "currency", currency });
    return true;
  } catch {
    return false;
  }
};

export const formatMoney = (
  value: number,
  locale: string,
  currency: string = DEFAULT_CURRENCY,
): string => {
  if (!Number.isFinite(value)) value = 0;
  if (!isCurrencyCode(currency)) {
    return `${formatAmount(value, locale)} ${currency}`.trim();
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/** Compact form for stat tiles: 1 234 567 -> "1,23 mil." */
export const formatCompactMoney = (
  value: number,
  locale: string,
  currency: string = DEFAULT_CURRENCY,
): string => {
  if (!Number.isFinite(value)) value = 0;
  if (!isCurrencyCode(currency)) {
    return `${formatAmount(value, locale)} ${currency}`.trim();
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 2 : 0,
  }).format(value);
};

/**
 * Sums grouped by currency. Under the agreed model invoices are never
 * converted, so a mixed-currency selection reports several totals rather than
 * one invented combined figure.
 */
export const sumByCurrency = (
  rows: readonly { currency: string; total: number }[],
): { currency: string; total: number }[] => {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.total);
  }
  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
};

export const distinctCurrencies = (
  rows: readonly { currency: string }[],
): string[] => [...new Set(rows.map((row) => row.currency))].sort();
