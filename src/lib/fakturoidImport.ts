/**
 * Reads a Fakturoid XML export into the shapes this app stores.
 *
 * Fakturoid offers eight export formats and this is the only one that is both
 * a single file and carries the invoice *lines*. CSV and Excel give
 * per-invoice totals only, which would collapse every invoice into one
 * fabricated line and lose a mixed-VAT split; ISDOC and Peppol are ZIPs of one
 * document per invoice.
 *
 * The file mirrors Fakturoid's API: one flat `<invoice>` per record with
 * snake_case children, the client denormalised onto every invoice
 * (`client_name`, `client_street`, …) rather than referenced, and `<lines>`
 * carrying the unit price both with and without VAT.
 */

import { findBtcAddress } from "./btcAddress";

export type FakturoidClient = {
  /** Fakturoid's own subject id, falling back to IČO and then the name. */
  key: string;
  name: string;
  companyIdentificationNumber: string | null;
  vatNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
};

/** A line in the same shape `useInvoiceForm` normalises one into. */
export type FakturoidItem = {
  amount: number;
  unit: string;
  description: string;
  unitPrice: number;
  vat: number;
};

export type FakturoidInvoice = {
  invoiceNumber: string;
  clientKey: string;
  clientName: string;
  currency: string | null;
  issueDate: string;
  duzp: string | null;
  paymentDate: string | null;
  paymentDays: number;
  paymentMethod: string;
  purchaseOrderNumber: string | null;
  invoicingNote: string | null;
  btcInvoice: boolean;
  btcAddress: string | null;
  /** The supplier account it was payable to, e.g. `322103029/0300`. */
  bankAccount: string | null;
  items: FakturoidItem[];
};

export type FakturoidSkipped = {
  /** Proformas and partial proformas: requests for payment, not invoices. */
  proforma: number;
  /** Cancelled invoices, which this app has no state for. */
  cancelled: number;
  /** Missing a number, a client or a usable issue date. */
  unusable: number;
};

export type FakturoidExport = {
  clients: FakturoidClient[];
  invoices: FakturoidInvoice[];
  skipped: FakturoidSkipped;
};

/**
 * A cost, the way this app stores one: from whom, and for what.
 *
 * Fakturoid exports expenses in the same shape as invoices with the parties
 * swapped — `supplier_name` where an invoice carries `client_name` — so the
 * line reader and the date handling below are shared between the two.
 */
export type FakturoidExpense = {
  /** The supplier's own document number, which is what the VAT return wants. */
  expenseNumber: string | null;
  supplierName: string;
  supplierIco: string | null;
  supplierVat: string | null;
  description: string;
  /** The taxable supply date where the export has one, else the issue date. */
  expenseDate: string;
  note: string | null;
  items: FakturoidItem[];
  /** Read off the document, for the costs entered without a breakdown. */
  amountWithoutVat: number;
  vatRate: number;
  amountWithVat: number;
  /** The document's own currency; null is the home one. */
  currency: string | null;
  /**
   * What Fakturoid converted the document to, where that differs — kept for
   * the note, because a VAT return still wants the koruna figure even though
   * the cost itself stays in the currency it was billed in.
   */
  homeTotal: number | null;
};

export type FakturoidExpenseSkipped = {
  /** Missing a supplier, a date or any amount at all. */
  unusable: number;
};

export type FakturoidExpenseExport = {
  expenses: FakturoidExpense[];
  skipped: FakturoidExpenseSkipped;
};

export class FakturoidParseError extends Error {
  override name = "FakturoidParseError";
}

/* Matching on `nodeName` rather than a CSS selector keeps `<line><name>` from
   answering a query for the invoice's own children. */
const childText = (parent: Element, tag: string): string => {
  for (const node of Array.from(parent.children)) {
    if (node.nodeName === tag) return (node.textContent ?? "").trim();
  }
  return "";
};

const childrenNamed = (parent: Element, tag: string): Element[] =>
  Array.from(parent.children).filter((node) => node.nodeName === tag);

const orNull = (value: string): string | null => value || null;

const isTrue = (value: string): boolean => value.toLowerCase() === "true";

/** Evolu's string types have hard limits; a name that long is already broken. */
const clip = (value: string, max: number): string =>
  value.length > max ? value.slice(0, max).trim() : value;

const clipOrNull = (value: string | null, max: number): string | null =>
  value === null ? null : orNull(clip(value, max));

/** Fakturoid writes plain numbers as `54862.0` and `1.0`. */
const numberValue = (value: string, fallback = 0): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** What a converted total is converted *to* — this app's own currency. */
const HOME_CURRENCY = "CZK";

/**
 * The rate a net and a gross figure imply, snapped to a legal one.
 *
 * The last resort for a document with neither lines nor a VAT summary: a
 * cost stored with a rate of nothing would be reported to the tax office as
 * a zero-rated supply.
 */
const impliedRate = (net: number, gross: number): number => {
  if (net <= 0 || gross <= net) return 0;
  const implied = (gross / net - 1) * 100;
  const legal = [21, 12, 15, 10];
  const nearest = legal.find((rate) => Math.abs(rate - implied) < 0.6);
  return nearest ?? round2(implied);
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const asDate = (value: string): string | null =>
  ISO_DATE.test(value) ? value : null;

const daysBetween = (from: string, to: string): number | null => {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
};

const readClient = (invoice: Element): FakturoidClient => {
  const street = [
    childText(invoice, "client_street"),
    childText(invoice, "client_street2"),
  ]
    .filter(Boolean)
    .join(", ");

  const locality = [
    childText(invoice, "client_zip"),
    childText(invoice, "client_city"),
  ]
    .filter(Boolean)
    .join(" ");

  /* A Czech address prints without the country, the way ARES fills one in.
     Anything else needs it or the address is not deliverable. */
  const country = childText(invoice, "client_country");
  const line2 = [locality, country && country !== "CZ" ? country : ""]
    .filter(Boolean)
    .join(", ");

  const registrationNo = childText(invoice, "client_registration_no");
  const name = clip(childText(invoice, "client_name"), 100);

  return {
    key:
      childText(invoice, "subject_id") ||
      registrationNo ||
      name.toLocaleLowerCase(),
    name,
    companyIdentificationNumber: orNull(clip(registrationNo, 100)),
    vatNumber: orNull(clip(childText(invoice, "client_vat_no"), 100)),
    addressLine1: orNull(clip(street, 1000)),
    addressLine2: orNull(clip(line2, 1000)),
  };
};

const readItems = (invoice: Element): FakturoidItem[] => {
  const [lines] = childrenNamed(invoice, "lines");
  if (!lines) return [];
  return childrenNamed(lines, "line").map((line) => ({
    /* A line with no quantity is one of the thing, the same default the
       composer applies to a blank quantity field. */
    amount: numberValue(childText(line, "quantity"), 1),
    unit: childText(line, "unit_name"),
    description: childText(line, "name"),
    /* Fakturoid quotes a line either net or gross depending on the invoice's
       `vat_price_mode`, but always writes both out per line. This app stores
       the net price and adds VAT on top, so take the one already net. */
    unitPrice: numberValue(
      childText(line, "unit_price_without_vat") ||
        childText(line, "unit_price"),
    ),
    vat: numberValue(childText(line, "vat_rate")),
  }));
};

export const parseFakturoidXml = (xml: string): FakturoidExport => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new FakturoidParseError("the file is not well-formed XML");
  }

  const root = doc.documentElement;
  const elements =
    root.nodeName === "invoice" ? [root] : childrenNamed(root, "invoice");
  if (root.nodeName !== "invoices" && root.nodeName !== "invoice") {
    throw new FakturoidParseError(`unexpected root element <${root.nodeName}>`);
  }

  const invoices: FakturoidInvoice[] = [];
  const skipped: FakturoidSkipped = {
    proforma: 0,
    cancelled: 0,
    unusable: 0,
  };
  /* One client carries many invoices and its address may have moved between
     them, so keep the version the most recent invoice was issued to. */
  const clients = new Map<string, { client: FakturoidClient; on: string }>();

  for (const element of elements) {
    if (
      isTrue(childText(element, "proforma")) ||
      isTrue(childText(element, "partial_proforma"))
    ) {
      skipped.proforma += 1;
      continue;
    }

    if (
      childText(element, "status") === "cancelled" ||
      childText(element, "cancelled_at")
    ) {
      skipped.cancelled += 1;
      continue;
    }

    const invoiceNumber = clip(childText(element, "number"), 100);
    const issueDate = asDate(childText(element, "issued_on"));
    const client = readClient(element);
    if (!invoiceNumber || !issueDate || !client.name) {
      skipped.unusable += 1;
      continue;
    }

    /* `due` is the agreed number of days and `due_on` the date it lands on.
       Deriving the days from the two dates preserves the due date the client
       actually saw, including the ones moved by hand. */
    const dueOn = asDate(childText(element, "due_on"));
    const spanned = dueOn ? daysBetween(issueDate, dueOn) : null;
    const due = Number(childText(element, "due"));
    const paymentDays = Math.max(
      0,
      spanned ?? (Number.isFinite(due) ? due : 0),
    );

    /* The note stays exactly as written — it is the text of the invoice —
       so an address lifted out of it is carried in both places. */
    const note = childText(element, "note");
    const btcAddress = clipOrNull(
      findBtcAddress(note, childText(element, "private_note")),
      100,
    );

    invoices.push({
      invoiceNumber,
      clientKey: client.key,
      clientName: client.name,
      currency: orNull(childText(element, "currency").toUpperCase()),
      issueDate,
      duzp: asDate(childText(element, "taxable_fulfillment_due")),
      paymentDate: asDate(childText(element, "paid_on")),
      paymentDays,
      /* This app knows two: `cash` prints "hotově" and drops the bank block.
         Card, PayPal and the rest all still land on the account. */
      paymentMethod:
        childText(element, "payment_method") === "cash" ? "cash" : "bank",
      purchaseOrderNumber: orNull(clip(childText(element, "order_number"), 100)),
      invoicingNote: orNull(clip(note, 1000)),
      btcInvoice: btcAddress !== null,
      btcAddress,
      bankAccount: orNull(clip(childText(element, "bank_account"), 100)),
      items: readItems(element),
    });

    const seen = clients.get(client.key);
    if (!seen || seen.on < issueDate) clients.set(client.key, { client, on: issueDate });
  }

  return {
    clients: Array.from(clients.values(), (entry) => entry.client),
    invoices,
    skipped,
  };
};

/**
 * The rate carrying the most money — the rule the expense form already
 * applies when it stamps one rate on a document whose lines carry several.
 */
const dominantLineRate = (items: readonly FakturoidItem[]): number => {
  const byRate = new Map<number, number>();
  for (const item of items) {
    if (!(item.vat > 0)) continue;
    byRate.set(item.vat, (byRate.get(item.vat) ?? 0) + item.amount * item.unitPrice);
  }
  if (byRate.size === 0) return 0;
  return [...byRate.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/** The rate off the export's own VAT summary, for a document with no lines. */
const summaryRate = (expense: Element): number => {
  const [summary] = childrenNamed(expense, "vat_rates_summary");
  if (!summary) return 0;
  let rate = 0;
  let largestBase = -1;
  for (const entry of Array.from(summary.children)) {
    const entryRate = numberValue(childText(entry, "vat_rate"));
    const base = numberValue(childText(entry, "base"));
    if (entryRate > 0 && base > largestBase) {
      rate = entryRate;
      largestBase = base;
    }
  }
  return rate;
};

/** The first tag of the list that has anything in it. */
const firstText = (element: Element, ...tags: string[]): string => {
  for (const tag of tags) {
    const value = childText(element, tag);
    if (value) return value;
  }
  return "";
};

/**
 * Fakturoid's expense export.
 *
 * The same file shape as the invoice one with the parties swapped, so it
 * shares the line reader and the date handling. Two things are decided here
 * rather than passed on:
 *
 * The date is the taxable supply date where the export has one. An expense's
 * date is what puts it in a VAT period, and that is the DUZP, not the day the
 * supplier happened to write the invoice.
 *
 * A document keeps the currency it was billed in, the way an invoice does —
 * nothing here is ever converted. Where Fakturoid also carried a converted
 * total, it comes through as `homeTotal` for the note, since the VAT return
 * still wants the koruna figure.
 */
export const parseFakturoidExpenseXml = (
  xml: string,
): FakturoidExpenseExport => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new FakturoidParseError("the file is not well-formed XML");
  }

  const root = doc.documentElement;
  if (root.nodeName !== "expenses" && root.nodeName !== "expense") {
    throw new FakturoidParseError(`unexpected root element <${root.nodeName}>`);
  }
  const elements =
    root.nodeName === "expense" ? [root] : childrenNamed(root, "expense");

  const expenses: FakturoidExpense[] = [];
  const skipped: FakturoidExpenseSkipped = { unusable: 0 };

  for (const element of elements) {
    const supplierName = clip(
      firstText(element, "supplier_name", "subject_name", "client_name"),
      100,
    );
    const expenseDate =
      asDate(childText(element, "taxable_fulfillment_due")) ??
      asDate(childText(element, "issued_on"));
    if (!supplierName || !expenseDate) {
      skipped.unusable += 1;
      continue;
    }

    const currency = childText(element, "currency").toUpperCase();
    const total = numberValue(childText(element, "total"));
    const subtotal = numberValue(childText(element, "subtotal"));
    const nativeTotal = numberValue(childText(element, "native_total"));

    /* Stored in the currency it was billed in, like an invoice: this app
       converts nothing, and a 50 EUR receipt filed as 50 Kč would be worse
       than one that says what it is. Fakturoid's own conversion is kept for
       the note — the VAT return still wants koruna. */
    const items = readItems(element);
    /* The converted total stands in for a missing one only where the two are
       the same money. On a foreign document it is koruna, and 12 100 filed
       as euros is a cost twenty-four times its size — such a document has no
       amount this import can trust, so it is skipped and counted. */
    const foreign = Boolean(currency) && currency !== HOME_CURRENCY;
    const amountWithVat = total || (foreign ? 0 : nativeTotal);
    const amountWithoutVat = subtotal || amountWithVat;
    if (items.length === 0 && amountWithVat <= 0) {
      skipped.unusable += 1;
      continue;
    }

    const description =
      clip(
        firstText(element, "description") ||
          items.find((item) => item.description)?.description ||
          supplierName,
        100,
      ) || supplierName;

    expenses.push({
      expenseNumber: orNull(
        clip(firstText(element, "original_number", "number", "variable_symbol"), 100),
      ),
      supplierName,
      supplierIco: orNull(
        clip(firstText(element, "supplier_registration_no", "registration_no"), 100),
      ),
      supplierVat: orNull(
        clip(firstText(element, "supplier_vat_no", "vat_no"), 100),
      ),
      description,
      expenseDate,
      note: orNull(clip(childText(element, "note"), 1000)),
      items,
      amountWithoutVat: round2(amountWithoutVat),
      vatRate:
        (items.length > 0 ? dominantLineRate(items) : 0) ||
        summaryRate(element) ||
        impliedRate(amountWithoutVat, amountWithVat),
      amountWithVat: round2(amountWithVat),
      currency: orNull(currency),
      homeTotal:
        nativeTotal > 0 && round2(nativeTotal) !== round2(total)
          ? round2(nativeTotal)
          : null,
    });
  }

  return { expenses, skipped };
};

export type ExistingClient = {
  id: string;
  name: string | null;
  companyIdentificationNumber: string | null;
};

const normalizeName = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

/**
 * The client record an imported invoice belongs to, or `null` to create one.
 *
 * IČO is the identity — a company can be in the address book under a shortened
 * name — and the name is the fallback for the ones entered without it.
 */
export const matchClient = (
  client: FakturoidClient,
  existing: readonly ExistingClient[],
): string | null => {
  const ico = client.companyIdentificationNumber;
  if (ico) {
    const byIco = existing.find(
      (row) => (row.companyIdentificationNumber ?? "").trim() === ico,
    );
    if (byIco) return byIco.id;
  }
  const name = normalizeName(client.name);
  if (!name) return null;
  return (
    existing.find((row) => normalizeName(row.name ?? "") === name)?.id ?? null
  );
};

/** Account numbers are written with and without spaces; compare them either way. */
export const matchBankAccount = (
  accountNumber: string,
  existing: readonly { id: string; accountNumber: string | null; iban: string | null }[],
): string | null => {
  const wanted = accountNumber.replace(/\s+/g, "").toLowerCase();
  if (!wanted) return null;
  const strip = (value: string | null) =>
    (value ?? "").replace(/\s+/g, "").toLowerCase();
  return (
    existing.find(
      (row) => strip(row.accountNumber) === wanted || strip(row.iban) === wanted,
    )?.id ?? null
  );
};
