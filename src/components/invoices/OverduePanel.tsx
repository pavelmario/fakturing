import { AlertTriangle } from "lucide-react";
import { useI18n } from "../../i18n";

type OverduePanelProps = {
  count: number;
  totals: readonly { currency: string; total: number }[];
  active: boolean;
  onToggle: () => void;
  formatMoney: (value: number, currency: string) => string;
};

/**
 * Exists only while something is actually overdue. There is no standing
 * receivables panel: when everything is paid, the page should say nothing
 * about it rather than show a row of zeroes.
 *
 * Totals arrive already split by currency — under the agreed model invoices
 * are never converted, so sums are reported per currency rather than combined.
 */
export function OverduePanel({
  count,
  totals,
  active,
  onToggle,
  formatMoney,
}: OverduePanelProps) {
  const { t, tp } = useI18n();
  if (count === 0) return null;

  return (
    <button
      type="button"
      className="overdue-banner"
      data-on={active}
      onClick={onToggle}
      aria-pressed={active}
    >
      <AlertTriangle />
      <span className="overdue-text">
        <b className="num">{count}</b>{" "}
        {tp("invoicesList.invoiceCount", count)}{" "}
        {t("invoicesList.overdueBannerSuffix")}
      </span>
      <span className="overdue-totals">
        {totals.map(({ currency, total }) => (
          <span key={currency} className="num">
            {formatMoney(total, currency)}
          </span>
        ))}
      </span>
      <span className="overdue-cta">
        {active
          ? t("invoicesList.overdueBannerClear")
          : t("invoicesList.overdueBannerShow")}
      </span>
    </button>
  );
}
