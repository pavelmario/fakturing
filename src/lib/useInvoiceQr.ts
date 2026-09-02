import { useEffect, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import QRCode from "qrcode";
import { supportsCzechQr } from "./money";

type QrInput = {
  invoice: {
    btcInvoice?: number | null;
    btcAddress?: string | null;
    paymentMethod?: string | null;
    currency?: string | null;
  } | null;
  /* The account this invoice is payable to — several may exist, so the
     profile's own fields are no longer the source of truth. */
  profile: {
    iban?: string | null;
    swift?: string | null;
    bankAccount?: string | null;
  } | null;
  invoiceTotal: number;
  invoiceTotalWithVat: number;
  invoiceDueDateQr: string;
  sanitizedInvoiceNumber: string;
  showVat: boolean;
};

export type InvoiceQrCodes = {
  /** The Czech SPD string — "QR platba". */
  bank: string | null;
  /** A BIP21 `bitcoin:` URI. */
  btc: string | null;
};

/**
 * Builds the payment QR codes, each independently of the other.
 *
 * A bitcoin invoice used to *replace* the bank code with a BIP21 URI, which
 * was wrong for the invoices this is written against: they are payable to an
 * account and accept BTC as well, so taking the banking QR away removed the
 * way most clients actually pay. Both are built when both are possible, and
 * the document prints them side by side.
 *
 * Either is null when its inputs cannot produce a valid code — no address for
 * BTC; for the bank code a cash invoice, a currency SPD cannot encode, or an
 * IBAN and SWIFT that are not both set, which used to render an empty frame.
 *
 * Extracted so the create flow can show the same document it just saved.
 */
export const useInvoiceQr = ({
  invoice,
  profile,
  invoiceTotal,
  invoiceTotalWithVat,
  invoiceDueDateQr,
  sanitizedInvoiceNumber,
  showVat,
}: QrInput): InvoiceQrCodes => {
  /* Kept as two strings rather than one object so an unchanged code still
     bails out of a re-render, the way it did before this returned a pair. */
  const [bankQr, setBankQr] = useState<string | null>(null);
  const [btcQr, setBtcQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const buildBtc = async (): Promise<string | null> => {
      if (!invoice || invoice.btcInvoice !== Evolu.sqliteTrue) return null;
      const address = (invoice.btcAddress ?? "").trim();
      if (!address) return null;

      const label = sanitizedInvoiceNumber
        ? `?label=${encodeURIComponent(sanitizedInvoiceNumber)}`
        : "";
      try {
        return await QRCode.toDataURL(`bitcoin:${address}${label}`, {
          margin: 0,
          width: 256,
        });
      } catch (error) {
        console.error("Failed to generate BTC QR code:", error);
        return null;
      }
    };

    const buildBank = async (): Promise<string | null> => {
      if (!invoice) return null;
      // No bank QR for cash payments
      if (invoice.paymentMethod === "cash") return null;

      /* The SPD format encodes CZK, so a foreign-currency invoice gets no
         Czech payment QR rather than a wrong one. */
      if (!supportsCzechQr(invoice.currency)) return null;

      // Require both IBAN and SWIFT set in settings
      if (!profile?.iban || !profile?.swift) return null;

      const ibanCandidate = (profile.iban ?? "").replace(/\s/g, "");
      if (!ibanCandidate) return null;

      const totalForQr = showVat ? invoiceTotalWithVat : invoiceTotal;
      const amount = Number.isFinite(totalForQr) ? totalForQr : 0;
      if (!amount || amount <= 0) return null;

      const variableSymbol = sanitizedInvoiceNumber;
      const formattedAmount = Number.isInteger(amount)
        ? String(amount)
        : amount.toFixed(2);
      const accountValue = profile?.swift
        ? `${ibanCandidate}+${profile.swift}`
        : ibanCandidate;
      const parts = [
        "SPD*1.0",
        `ACC:${accountValue}`,
        "PT:IP",
        `AM:${formattedAmount}`,
        variableSymbol ? `X-VS:${variableSymbol}` : "",
        invoiceDueDateQr ? `DT:${invoiceDueDateQr}` : "",
        "MSG:QRPLATBA",
        "",
      ].filter((value) => value !== undefined);

      try {
        return await QRCode.toDataURL(parts.join("*"), {
          margin: 0,
          width: 256,
        });
      } catch (error) {
        console.error("Failed to generate QR code:", error);
        return null;
      }
    };

    const build = async () => {
      const [bank, btc] = await Promise.all([buildBank(), buildBtc()]);
      if (cancelled) return;
      setBankQr(bank);
      setBtcQr(btc);
    };

    build();
    return () => {
      cancelled = true;
    };
  }, [
    invoice,
    invoice?.btcInvoice,
    invoice?.btcAddress,
    invoice?.paymentMethod,
    invoice?.currency,
    invoiceTotal,
    invoiceTotalWithVat,
    invoiceDueDateQr,
    profile?.iban,
    profile?.bankAccount,
    profile?.swift,
    showVat,
    sanitizedInvoiceNumber,
  ]);

  return useMemo(() => ({ bank: bankQr, btc: btcQr }), [bankQr, btcQr]);
};
