import { useI18n } from "../../i18n";

type InvoiceSummaryProps = {
  net: number;
  vat: number;
  gross: number;
  isVatPayer: boolean;
  formatMoney: (value: number) => string;
};

/**
 * The form used to show only the net sum, even for a VAT payer — so the figure
 * on screen disagreed with the one on the resulting PDF. It now shows the
 * whole build-up.
 */
export function InvoiceSummary({
  net,
  vat,
  gross,
  isVatPayer,
  formatMoney,
}: InvoiceSummaryProps) {
  const { t } = useI18n();

  return (
    <div className="summary">
      {isVatPayer ? (
        <>
          <div className="summary-row">
            <span>{t("invoiceCreate.summaryNet")}</span>
            <span className="num">{formatMoney(net)}</span>
          </div>
          <div className="summary-row">
            <span>{t("invoiceCreate.summaryVat")}</span>
            <span className="num">{formatMoney(vat)}</span>
          </div>
        </>
      ) : null}
      <div className="summary-row summary-total">
        <span>{t("invoiceCreate.summaryTotal")}</span>
        <span className="num">{formatMoney(gross)}</span>
      </div>
    </div>
  );
}
