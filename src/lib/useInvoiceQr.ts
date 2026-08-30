import { useEffect, useState } from "react";
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

/**
 * Builds the payment QR: a BIP21 URI for bitcoin invoices, otherwise the Czech
 * SPD ("QR platba") string. Returns null when the inputs cannot produce a
 * valid code — notably when IBAN and SWIFT are not both set, which previously
 * still rendered an empty QR block on the document.
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
}: QrInput): string | null => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const buildQr = async () => {
      if (!invoice) {
        setQrCodeDataUrl(null);
        return;
      }

      // If the invoice is a BTC invoice, build a bitcoin: URI QR
      if (invoice.btcInvoice === Evolu.sqliteTrue) {
        const address = (invoice.btcAddress ?? "").trim();
        if (!address) {
          setQrCodeDataUrl(null);
          return;
        }

        const label = sanitizedInvoiceNumber
          ? `?label=${encodeURIComponent(sanitizedInvoiceNumber)}`
          : "";
        const uri = `bitcoin:${address}${label}`;
        try {
          const dataUrl = await QRCode.toDataURL(uri, {
            margin: 0,
            width: 256,
          });
          setQrCodeDataUrl(dataUrl);
          return;
        } catch (error) {
          console.error("Failed to generate BTC QR code:", error);
          setQrCodeDataUrl(null);
          return;
        }
      }

      // For non-BTC invoices, do not show QR for cash payments
      if (invoice.paymentMethod === "cash") {
        setQrCodeDataUrl(null);
        return;
      }

      /* The SPD format encodes CZK, so a foreign-currency invoice gets no
         Czech payment QR rather than a wrong one. */
      if (!supportsCzechQr(invoice.currency)) {
        setQrCodeDataUrl(null);
        return;
      }

      // Require both IBAN and SWIFT set in settings for bank QR (non-BTC)
      if (!profile?.iban || !profile?.swift) {
        setQrCodeDataUrl(null);
        return;
      }

      const ibanCandidate = (profile.iban ?? "").replace(/\s/g, "");
      if (!ibanCandidate) {
        setQrCodeDataUrl(null);
        return;
      }

      const totalForQr = showVat ? invoiceTotalWithVat : invoiceTotal;
      const amount = Number.isFinite(totalForQr) ? totalForQr : 0;
      if (!amount || amount <= 0) {
        setQrCodeDataUrl(null);
        return;
      }

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
        const dataUrl = await QRCode.toDataURL(parts.join("*"), {
          margin: 0,
          width: 256,
        });
        setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error("Failed to generate QR code:", error);
        setQrCodeDataUrl(null);
      }
    };

    buildQr();
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

  return qrCodeDataUrl;
};
