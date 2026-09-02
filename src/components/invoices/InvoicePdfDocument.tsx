import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import * as Evolu from "@evolu/common";
import type { InvoiceItem } from "../../lib/invoice";
import type { InvoiceQrCodes } from "../../lib/useInvoiceQr";

/**
 * The A4 invoice document.
 *
 * Lifted verbatim out of InvoiceDetailPage, where it sat inline as ~470 lines
 * of template and styles inside an already 1800-line component and could not
 * be rendered from anywhere else — which is why the create flow had no way to
 * show you the invoice it had just written.
 */

/* Czech diacritics need a font with full Latin Extended coverage. */
Font.register({
  family: "NotoSans",
  src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf",
  fontWeight: 400,
});

Font.register({
  family: "NotoSans",
  src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf",
  fontWeight: 700,
});

export type InvoicePdfData = {
  invoice: {
    invoiceNumber?: string | null;
    clientName?: string | null;
    paymentMethod?: string | null;
    purchaseOrderNumber?: string | null;
    invoicingNote?: string | null;
    btcInvoice?: number | null;
    btcAddress?: string | null;
  };
  profile: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    companyIdentificationNumber?: string | null;
    vatNumber?: string | null;
    bankAccount?: string | null;
    invoiceFooterText?: string | null;
  } | null;
  selectedClient: {
    name?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    companyIdentificationNumber?: string | null;
    vatNumber?: string | null;
  } | null;
  normalizedItems: InvoiceItem[];
  invoiceNumberValue: string;
  invoiceIssueDate: string;
  invoiceDueDate: string;
  invoiceDuzpDate: string;
  invoiceTotal: number;
  invoiceTotalWithVat: number;
  totalVatAmount: number;
  showVat: boolean;
  qrCodes: InvoiceQrCodes;
  showQuantity: boolean;
  displayClientName: string;
  sanitizedInvoiceNumber: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number, maxFraction?: number) => string;
};

const pdfStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "NotoSans",
    color: "#111827",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
  },
  headerLine: {
    height: 2,
    backgroundColor: "#6b7280",
    marginBottom: 18,
  },
  columns: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 24,
  },
  column: {
    flexGrow: 1,
    flexBasis: 0,
  },
  label: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 8,
  },
  textBold: {
    fontWeight: 700,
  },
  textMuted: {
    color: "#6b7280",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 6,
    marginTop: 16,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  colQty: { width: "6%" },
  colUnit: { width: "6%" },
  colDesc: { width: "64%" },
  /* Description absorbs Počet + MJ (12%) when the invoice is not billing
     per unit. */
  colDescWide: { width: "76%" },
  colDescVatWide: { width: "53%" },
  colUnitPrice: { width: "12%", textAlign: "right", paddingLeft: 4 },
  colTotal: { width: "12%", textAlign: "right", paddingLeft: 4 },
  /* VAT-payer row: qty 6 + unit 6 + desc 41 + unitPrice 13 + net 13 + rate 7
     + gross 14 = 100. These used to total 114%, so the rate ran into the
     gross column and rendered as one unreadable number ("2114 520 Kč"). */
  colDescVat: { width: "41%" },
  colUnitPriceVat: { width: "13%", textAlign: "right", paddingLeft: 4 },
  colTotalNoVat: { width: "13%", textAlign: "right", paddingLeft: 4 },
  colVatPercent: { width: "7%", textAlign: "right", paddingLeft: 4 },
  // colVatAmount is hidden for VAT payer
  colTotalVat: { width: "14%", textAlign: "right", paddingLeft: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: 700,
    marginLeft: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 18,
  },
  qrRow: {
    flexDirection: "row",
    gap: 10,
  },
  qrBlock: {
    width: 120,
    alignItems: "flex-start",
  },
  qrImage: {
    width: 110,
    height: 110,
    borderWidth: 1,
    borderColor: "#d1d5db",
    padding: 6,
  },
  /* Two codes have to share the width one used to have, next to a totals
     block that takes half the page. */
  qrBlockPair: {
    width: 104,
    alignItems: "flex-start",
  },
  qrImagePair: {
    width: 96,
    height: 96,
    borderWidth: 1,
    borderColor: "#d1d5db",
    padding: 5,
  },
  qrLabel: {
    marginTop: 6,
    fontSize: 9,
    color: "#6b7280",
  },
  totalBlock: {
    width: "50%",
    alignItems: "flex-end",
  },
  btcNote: {
    marginTop: 10,
    alignItems: "flex-end",
    width: "100%",
  },
  btcNoteText: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "right",
    width: "100%",
  },
  btcNoteAddress: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "right",
    width: "100%",
    wordBreak: "break-all",
  },
  footerLine: {
    height: 2,
    backgroundColor: "#6b7280",
    width: "100%",
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#6b7280",
  },
  footerLeft: {
    width: "50%",
    paddingRight: 8,
  },
  invoicingNote: {
    marginTop: 12,
    marginBottom: 8,
    width: "100%",
  },
  footerRight: {
    width: "50%",
    textAlign: "right",
  },
});

export function InvoicePdfDocument({
  invoice,
  profile,
  selectedClient,
  normalizedItems,
  invoiceNumberValue,
  invoiceIssueDate,
  invoiceDueDate,
  invoiceDuzpDate,
  invoiceTotal,
  invoiceTotalWithVat,
  totalVatAmount,
  showVat,
  qrCodes,
  showQuantity,
  displayClientName,
  sanitizedInvoiceNumber,
  t,
  formatCurrency,
  formatNumber,
}: InvoicePdfData) {
  /* Side by side they have to be smaller; alone, a code keeps its old size. */
  const bothQrCodes = Boolean(qrCodes.bank && qrCodes.btc);

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerRow}>
          <Text />
          <Text style={pdfStyles.headerTitle}>
            {t("pdf.invoiceTitle", {
              number: invoiceNumberValue || t("common.placeholderDash"),
            })}
          </Text>
        </View>
        <View style={pdfStyles.headerLine} />

        <View style={pdfStyles.columns}>
          <View style={pdfStyles.column}>
            <Text style={pdfStyles.label}>{t("pdf.supplier")}</Text>
            <Text style={pdfStyles.textBold}>{profile?.name ?? ""}</Text>
            <Text style={pdfStyles.textMuted}>
              {profile?.addressLine1 ?? ""}
            </Text>
            <Text style={pdfStyles.textMuted}>
              {profile?.addressLine2 ?? ""}
            </Text>
            <View style={{ marginTop: 6 }}>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>{t("pdf.companyId")}</Text>
                <Text>{profile?.companyIdentificationNumber ?? ""}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {profile?.vatNumber
                    ? t("pdf.vatIdOrNonVat")
                    : t("pdf.nonVatPayer")}
                </Text>
                <Text>{profile?.vatNumber ?? ""}</Text>
              </View>
            </View>
          </View>

          <View style={pdfStyles.column}>
            <Text style={pdfStyles.label}>{t("pdf.customer")}</Text>
            <Text style={pdfStyles.textBold}>{displayClientName}</Text>
            <Text style={pdfStyles.textMuted}>
              {selectedClient?.addressLine1 ?? ""}
            </Text>
            <Text style={pdfStyles.textMuted}>
              {selectedClient?.addressLine2 ?? ""}
            </Text>
            <View style={{ marginTop: 6 }}>
              {selectedClient?.companyIdentificationNumber ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>{t("pdf.companyId")}</Text>
                  <Text>{selectedClient.companyIdentificationNumber}</Text>
                </View>
              ) : null}
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {selectedClient?.vatNumber
                    ? t("pdf.vatIdOrNonVat")
                    : t("pdf.nonVatPayer")}
                </Text>
                <Text>{selectedClient?.vatNumber ?? ""}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={pdfStyles.columns}>
            <View style={pdfStyles.column}>
              {invoice?.paymentMethod !== "cash" ? (
                <>
                  <View style={pdfStyles.detailRow}>
                    <Text style={pdfStyles.textMuted}>
                      {t("pdf.bankAccount")}
                    </Text>
                    <Text>{profile?.bankAccount ?? ""}</Text>
                  </View>
                  <View style={pdfStyles.detailRow}>
                    <Text style={pdfStyles.textMuted}>
                      {t("pdf.variableSymbol")}
                    </Text>
                    <Text>{sanitizedInvoiceNumber}</Text>
                  </View>
                </>
              ) : null}
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {t("pdf.paymentMethod")}
                </Text>
                <Text>
                  {invoice?.paymentMethod === "cash"
                    ? t("pdf.paymentCash")
                    : t("pdf.paymentBank")}
                </Text>
              </View>
            </View>
            <View style={pdfStyles.column}>
              {invoice?.purchaseOrderNumber?.trim() ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>
                    {t("pdf.purchaseOrderNumber")}
                  </Text>
                  <Text>{invoice.purchaseOrderNumber}</Text>
                </View>
              ) : null}
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>{t("pdf.issueDate")}</Text>
                <Text>{invoiceIssueDate}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>{t("pdf.dueDate")}</Text>
                <Text>{invoiceDueDate}</Text>
              </View>
              {invoiceDuzpDate ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>{t("pdf.duzpDate")}</Text>
                  <Text>{invoiceDuzpDate}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {invoice.invoicingNote && invoice.invoicingNote.trim() ? (
          <View style={pdfStyles.invoicingNote}>
            <Text>{invoice.invoicingNote}</Text>
          </View>
        ) : null}

        {/* `fixed` repeats the headings on every page — a long invoice used to
            continue on page 2 as unlabelled columns of numbers. */}
        <View style={pdfStyles.tableHeader} fixed>
          {showQuantity ? (
            <>
              <Text style={[pdfStyles.colQty, pdfStyles.textMuted]}>
                {t("pdf.tableQty")}
              </Text>
              <Text style={[pdfStyles.colUnit, pdfStyles.textMuted]}>
                {t("pdf.tableUnit")}
              </Text>
            </>
          ) : null}
          <Text
            style={[
              showQuantity
                ? showVat
                  ? pdfStyles.colDescVat
                  : pdfStyles.colDesc
                : showVat
                  ? pdfStyles.colDescVatWide
                  : pdfStyles.colDescWide,
              pdfStyles.textMuted,
            ]}
          >
            {t("pdf.tableDescription")}
          </Text>
          <Text
            style={[
              showVat ? pdfStyles.colUnitPriceVat : pdfStyles.colUnitPrice,
              pdfStyles.textMuted,
            ]}
          >
            {showQuantity
              ? t("pdf.tableUnitPrice")
              : t("pdf.tablePrice")}
          </Text>
          {showVat ? (
            <>
              <Text style={[pdfStyles.colTotalNoVat, pdfStyles.textMuted]}>
                {t("pdf.tableTotalNoVat")}
              </Text>
              <Text style={[pdfStyles.colVatPercent, pdfStyles.textMuted]}>
                {t("pdf.tableVat")}
              </Text>
              {/* DPH column hidden for VAT payer */}
              <Text style={[pdfStyles.colTotalVat, pdfStyles.textMuted]}>
                {t("pdf.tableTotalVat")}
              </Text>
            </>
          ) : (
            <Text style={[pdfStyles.colTotal, pdfStyles.textMuted]}>
              {t("pdf.tableTotal")}
            </Text>
          )}
        </View>

        {normalizedItems.map((item, index) => {
          const amount = Number(item.amount) || 0;
          const unitPrice = Number(item.unitPrice) || 0;
          const vatPercent = Number(item.vat) || 0;
          const lineTotal = amount * unitPrice;
          const vatAmount = lineTotal * (vatPercent / 100);
          const lineTotalWithVat = lineTotal + vatAmount;

          return (
            <View
              style={pdfStyles.tableRow}
              key={`${item.description}-${index}`}
              wrap={false}
            >
              {showQuantity ? (
                <>
                  <Text style={pdfStyles.colQty}>
                    {item.amount ? formatNumber(Number(item.amount)) : ""}
                  </Text>
                  <Text style={pdfStyles.colUnit}>{item.unit}</Text>
                </>
              ) : null}
              <Text
                style={
                  showQuantity
                    ? showVat
                      ? pdfStyles.colDescVat
                      : pdfStyles.colDesc
                    : showVat
                      ? pdfStyles.colDescVatWide
                      : pdfStyles.colDescWide
                }
              >
                {item.description}
              </Text>
              <Text
                style={
                  showVat ? pdfStyles.colUnitPriceVat : pdfStyles.colUnitPrice
                }
              >
                {formatCurrency(unitPrice)}
              </Text>
              {showVat ? (
                <>
                  <Text style={pdfStyles.colTotalNoVat}>
                    {formatCurrency(lineTotal)}
                  </Text>
                  <Text style={pdfStyles.colVatPercent}>
                    {vatPercent ? formatNumber(vatPercent, 2) : ""}
                  </Text>
                  {/* DPH column hidden for VAT payer */}
                  <Text style={pdfStyles.colTotalVat}>
                    {formatCurrency(lineTotalWithVat)}
                  </Text>
                </>
              ) : (
                <Text style={pdfStyles.colTotal}>
                  {formatCurrency(lineTotal)}
                </Text>
              )}
            </View>
          );
        })}

        {/* Kept whole: the totals were being orphaned onto a page of their
            own, away from the QR they belong beside. */}
        <View style={pdfStyles.summaryRow} wrap={false}>
          {qrCodes.bank || qrCodes.btc ? (
            <View style={pdfStyles.qrRow}>
              {qrCodes.bank ? (
                <View style={bothQrCodes ? pdfStyles.qrBlockPair : pdfStyles.qrBlock}>
                  <Image
                    style={bothQrCodes ? pdfStyles.qrImagePair : pdfStyles.qrImage}
                    src={qrCodes.bank}
                  />
                  <Text style={pdfStyles.qrLabel}>{t("pdf.qrPayment")}</Text>
                </View>
              ) : null}
              {qrCodes.btc ? (
                <View style={bothQrCodes ? pdfStyles.qrBlockPair : pdfStyles.qrBlock}>
                  <Image
                    style={bothQrCodes ? pdfStyles.qrImagePair : pdfStyles.qrImage}
                    src={qrCodes.btc}
                  />
                  <Text style={pdfStyles.qrLabel}>{t("pdf.qrPaymentBtc")}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View />
          )}
          <View style={pdfStyles.totalBlock}>
            <View style={pdfStyles.totalRow}>
              <View style={{ alignItems: "flex-end" }}>
                {showVat ? (
                  <>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <Text style={pdfStyles.textMuted}>
                        {t("pdf.totalNoVat")}
                      </Text>
                      <Text style={pdfStyles.textMuted}>
                        {formatCurrency(invoiceTotal)}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <Text style={pdfStyles.textMuted}>
                        {t("pdf.totalVat")}
                      </Text>
                      <Text style={pdfStyles.textMuted}>
                        {formatCurrency(totalVatAmount)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
            </View>
            <View style={pdfStyles.footerLine} />
            <View style={pdfStyles.totalRow}>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={pdfStyles.totalValue}>
                  {t("pdf.total")}{" "}
                  {formatCurrency(showVat ? invoiceTotalWithVat : invoiceTotal)}
                </Text>
              </View>
            </View>
          </View>
        </View>
        {invoice.btcInvoice === Evolu.sqliteTrue ? (
          <View style={pdfStyles.btcNote}>
            <Text style={pdfStyles.btcNoteText}>{t("pdf.btcNote")}</Text>
            <Text
              style={pdfStyles.btcNoteAddress}
              hyphenationCallback={(word) => [word]}
            >
              {invoice.btcAddress ?? ""}
            </Text>
          </View>
        ) : null}
        <View style={pdfStyles.footer}>
          <View style={pdfStyles.footerLeft}>
            <Text>{profile?.invoiceFooterText ?? ""}</Text>
          </View>
          <Text style={pdfStyles.footerRight}>
            {[profile?.email, profile?.phone].filter(Boolean).join(" | ")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
