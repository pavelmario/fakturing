import { DEFAULT_CURRENCY } from "./money";

/**
 * The koruna value of a document billed in something else.
 *
 * This app converts nothing on its own — an amount is what the document says.
 * A rate is a fact about that document, though: the one its owner used to put
 * it in the books, and the one the VAT return is filed at. Stored on the
 * expense, it lets the totals and the control statement include a foreign
 * document without the app inventing anything.
 *
 * The number is koruna per one unit of the currency, so 24.20 for a euro.
 */

export const round2 = (value: number): number => Math.round(value * 100) / 100;

type RateSource = {
  currency?: string | null;
  exchangeRate?: number | null;
};

/**
 * The factor to koruna: 1 for a koruna document, the stored rate for a foreign
 * one, `null` when a foreign document has no rate and so cannot be counted.
 */
export const rateOf = (expense: RateSource): number | null => {
  const currency = (expense.currency ?? DEFAULT_CURRENCY).trim().toUpperCase();
  if (!currency || currency === DEFAULT_CURRENCY) return 1;
  const rate = Number(expense.exchangeRate ?? 0);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

export const toHome = (value: number, rate: number): number =>
  round2(value * rate);

/* ------------------------------------------------------------------ *
 * The ČNB rate for a day
 * ------------------------------------------------------------------ */

/**
 * Fetched through the app's own origin.
 *
 * `api.cnb.cz` sends no `Access-Control-Allow-Origin`, so a browser cannot
 * read it directly however public the data is. The host rewrites this path
 * onto the bank's API (see vercel.json, public/_redirects and vite.config.ts);
 * where it is not rewritten the fetch simply fails and the rate is typed by
 * hand, which is what the field is for.
 */
const CNB_PATH = "/api/cnb/exrates/daily";

const CACHE_KEY = "invoiceApp_cnbRates";

type CachedDay = Record<string, number>;

const readCache = (): Record<string, CachedDay> => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CachedDay>) : {};
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, CachedDay>): void => {
  try {
    /* A day's rates never change once published, so the cache only grows —
       capped at the last hundred days asked for, which is more than a year of
       ordinary use and still nothing to store. */
    const days = Object.keys(cache);
    const trimmed =
      days.length <= 100
        ? cache
        : Object.fromEntries(days.sort().slice(-100).map((d) => [d, cache[d]]));
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* A full or blocked storage is not a reason to fail a lookup. */
  }
};

type CnbRate = {
  currencyCode?: string;
  /** Some currencies are quoted per 100 or per 1000 units. */
  amount?: number;
  rate?: number;
  /** The day the table was published for. */
  validFor?: string;
};

/**
 * Why a rate could not be had.
 *
 * Told apart rather than collapsed into "it did not work", because each one
 * asks something different of the person reading it: wait, type it in, or
 * stop expecting this host to ever answer.
 */
export type RateFailure =
  | "offline"
  | "unreachable"
  | "notProxied"
  | "unavailable"
  | "noTable"
  | "noRate";

export type RateLookup =
  | { ok: true; rate: number; validFor: string }
  | { ok: false; reason: RateFailure };

/**
 * The bank's rate for one unit of `currency` on `date` (an ISO day).
 *
 * A weekend or a holiday is not a failure: the bank answers with the last
 * table published, which is the rate in force that day. A date before the
 * series starts answers with nothing, which is.
 */
export const fetchCnbRate = async (
  currency: string,
  date: string,
): Promise<RateLookup> => {
  const code = currency.trim().toUpperCase();
  const day = date.slice(0, 10);
  if (code === DEFAULT_CURRENCY) return { ok: true, rate: 1, validFor: day };
  if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, reason: "noTable" };
  }

  /* A day the bank has not reached yet has no rate; answering with today's
     table would put a rate on a document dated next month. */
  if (day > new Date().toISOString().slice(0, 10)) {
    return { ok: false, reason: "noTable" };
  }

  const cache = readCache();
  const cached = cache[day]?.[code];
  if (cached) return { ok: true, rate: cached, validFor: day };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, reason: "offline" };
  }

  let response: Response;
  try {
    response = await fetch(`${CNB_PATH}?date=${encodeURIComponent(day)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    /* A refused connection, a dropped one, or a browser blocking it. */
    return { ok: false, reason: "unreachable" };
  }

  /* A host that does not rewrite this path answers something of its own —
     its 404 page, or the app's index.html with a 200. What tells that apart
     from the bank having a bad day is the body, not the status: a rewrite
     passes the upstream status through, so treating every 404 as a broken
     host blamed the hosting for the bank's own answers. */
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return { ok: false, reason: "notProxied" };
  if (!response.ok) return { ok: false, reason: "unavailable" };

  let payload: { rates?: CnbRate[] };
  try {
    payload = (await response.json()) as { rates?: CnbRate[] };
  } catch {
    return { ok: false, reason: "notProxied" };
  }

  const rates = payload.rates ?? [];
  if (rates.length === 0) return { ok: false, reason: "noTable" };

  /* Cache the whole day, not the one currency: the table came over anyway,
     and the next expense is as likely to be in another of them. */
  const table: CachedDay = {};
  for (const entry of rates) {
    const units = Number(entry.amount ?? 1) || 1;
    const rate = Number(entry.rate ?? 0);
    if (entry.currencyCode && rate > 0) {
      table[entry.currencyCode.toUpperCase()] = rate / units;
    }
  }

  const validFor = rates[0]?.validFor ?? day;
  /* Cached under the day it is actually for, and under the day asked for
     only when they are the same. The bank publishes around half past two, so
     a morning question about today is answered with yesterday's table —
     filing that under today would answer every later question with it, for
     good, since a published table is never re-fetched. */
  cache[validFor] = table;
  if (validFor === day) cache[day] = table;
  writeCache(cache);

  const rate = table[code];
  return rate
    ? { ok: true, rate, validFor }
    : { ok: false, reason: "noRate" };
};
