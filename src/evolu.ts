import * as Evolu from "@evolu/common";
import { createEvolu, SimpleName } from "@evolu/common";
import { createUseEvolu, EvoluProvider } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";

const RELAY_URL_KEY = "invoiceApp_relayUrl";
const DEFAULT_RELAY_URL = "wss://free.evoluhq.com";

export const getRelayUrl = (): string => {
  if (typeof window === "undefined") return DEFAULT_RELAY_URL;
  const stored = window.localStorage.getItem(RELAY_URL_KEY);
  if (!stored) return DEFAULT_RELAY_URL;
  if (!stored.startsWith("ws://") && !stored.startsWith("wss://"))
    return DEFAULT_RELAY_URL;
  return stored;
};

export const setRelayUrl = (url: string): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RELAY_URL_KEY, url);
};

const UserProfileId = Evolu.id("UserProfile");

export const Schema = {
  userProfile: {
    id: UserProfileId,
    name: Evolu.NonEmptyTrimmedString100,
    email: Evolu.nullOr(Evolu.TrimmedString100),
    phone: Evolu.nullOr(Evolu.TrimmedString100),
    addressLine1: Evolu.nullOr(Evolu.TrimmedString1000),
    addressLine2: Evolu.nullOr(Evolu.TrimmedString1000),
    companyIdentificationNumber: Evolu.nullOr(Evolu.TrimmedString100),
    vatNumber: Evolu.nullOr(Evolu.TrimmedString100),
    vatPayer: Evolu.nullOr(Evolu.SqliteBoolean),
    bankAccount: Evolu.nullOr(Evolu.TrimmedString100),
    swift: Evolu.nullOr(Evolu.TrimmedString100),
    iban: Evolu.nullOr(Evolu.TrimmedString100),
    invoiceFooterText: Evolu.nullOr(Evolu.TrimmedString1000),
    discreteMode: Evolu.nullOr(Evolu.SqliteBoolean),
    expenses: Evolu.nullOr(Evolu.SqliteBoolean),
    supplierVatPrefill: Evolu.nullOr(Evolu.TrimmedString1000),
    language: Evolu.nullOr(Evolu.TrimmedString100),
    poRequired: Evolu.nullOr(Evolu.SqliteBoolean),
    /* Whether new invoices default to billing per unit (hours, days) rather
       than a fixed price per deliverable. */
    billPerUnit: Evolu.nullOr(Evolu.SqliteBoolean),
    mempoolUrl: Evolu.nullOr(Evolu.TrimmedString1000),
    invoiceNamingFormat: Evolu.nullOr(Evolu.TrimmedString100),
    /** Pattern for new invoice numbers, e.g. `{rok}-{poradi:4}`. */
    invoiceNumberFormat: Evolu.nullOr(Evolu.TrimmedString100),
    taxOfficeCode: Evolu.nullOr(Evolu.TrimmedString100),
    taxOfficeWorkplaceCode: Evolu.nullOr(Evolu.TrimmedString100),
  },
  /* Several accounts, e.g. one per currency. The legacy single account on
     userProfile stays as a fallback for anyone who has not added one yet. */
  bankAccount: {
    id: Evolu.id("BankAccount"),
    label: Evolu.NonEmptyTrimmedString100,
    accountNumber: Evolu.nullOr(Evolu.TrimmedString100),
    iban: Evolu.nullOr(Evolu.TrimmedString100),
    swift: Evolu.nullOr(Evolu.TrimmedString100),
    currency: Evolu.nullOr(Evolu.TrimmedString100),
    isDefault: Evolu.nullOr(Evolu.SqliteBoolean),
    deleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
  client: {
    id: Evolu.id("Client"),
    name: Evolu.NonEmptyTrimmedString100,
    email: Evolu.nullOr(Evolu.TrimmedString100),
    phone: Evolu.nullOr(Evolu.TrimmedString100),
    addressLine1: Evolu.nullOr(Evolu.TrimmedString1000),
    addressLine2: Evolu.nullOr(Evolu.TrimmedString1000),
    companyIdentificationNumber: Evolu.nullOr(Evolu.TrimmedString100),
    vatNumber: Evolu.nullOr(Evolu.TrimmedString100),
    note: Evolu.nullOr(Evolu.TrimmedString1000),
    deleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
  invoice: {
    id: Evolu.id("Invoice"),
    invoiceNumber: Evolu.NonEmptyTrimmedString100,
    /** Snapshot of the client's name as it was when the invoice was issued. */
    clientName: Evolu.NonEmptyTrimmedString100,
    /** The client record, so renaming a client keeps its history attached. */
    clientId: Evolu.nullOr(Evolu.TrimmedString100),
    /** One currency per invoice; amounts are never converted. */
    currency: Evolu.nullOr(Evolu.TrimmedString100),
    issueDate: Evolu.DateIso,
    duzp: Evolu.nullOr(Evolu.DateIso),
    paymentDate: Evolu.nullOr(Evolu.DateIso),
    paymentDays: Evolu.NonNegativeNumber,
    paymentMethod: Evolu.nullOr(Evolu.TrimmedString100),
    purchaseOrderNumber: Evolu.nullOr(Evolu.TrimmedString100),
    invoicingNote: Evolu.nullOr(Evolu.TrimmedString1000),
    btcInvoice: Evolu.SqliteBoolean,
    btcAddress: Evolu.nullOr(Evolu.TrimmedString100),
    /** Which of the supplier's accounts this invoice is payable to. */
    bankAccountId: Evolu.nullOr(Evolu.TrimmedString100),
    items: Evolu.Json,
    deleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
  expense: {
    id: Evolu.id("Expense"),
    expenseNumber: Evolu.nullOr(Evolu.TrimmedString100),
    supplierVat: Evolu.nullOr(Evolu.TrimmedString100),
    amountWithoutVat: Evolu.nullOr(Evolu.NonNegativeNumber),
    vatRate: Evolu.nullOr(Evolu.NonNegativeNumber),
    amountWithVat: Evolu.nullOr(Evolu.NonNegativeNumber),
    description: Evolu.NonEmptyTrimmedString100,
    expenseDate: Evolu.DateIso,
    deleted: Evolu.nullOr(Evolu.SqliteBoolean),
  },
};

export type UserProfileInput = {
  name: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  companyIdentificationNumber?: string;
  vatNumber?: string;
  vatPayer?: 0 | 1 | null;
  bankAccount?: string;
  swift?: string;
  iban?: string;
  invoiceFooterText?: string;
  discreteMode?: 0 | 1 | null;
  expenses?: 0 | 1 | null;
  supplierVatPrefill?: string;
  invoiceNamingFormat?: string;
  invoiceNumberFormat?: string;
  language?: string;
  poRequired?: 0 | 1 | null;
  billPerUnit?: 0 | 1 | null;
  mempoolUrl?: string;
  taxOfficeCode?: string;
  taxOfficeWorkplaceCode?: string;
};

const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("invoice-manager"),
  transports: [{ type: "WebSocket", url: getRelayUrl() }],
});

export const useEvolu = createUseEvolu(evolu);
export { EvoluProvider, evolu };
