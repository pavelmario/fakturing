import { Check, Search, X } from "lucide-react";
import type { InvoiceStatus } from "../../lib/invoice";
import { useI18n } from "../../i18n";

export type PeriodFilter = { year: number; month: number | null } | null;
export type PaymentType = "fiat" | "bitcoin";

type FilterBarProps = {
  search: string;
  onSearch: (value: string) => void;
  statuses: ReadonlySet<InvoiceStatus>;
  onToggleStatus: (status: InvoiceStatus) => void;
  types: ReadonlySet<PaymentType>;
  onToggleType: (type: PaymentType) => void;
  period: PeriodFilter;
  onClearPeriod: () => void;
  periodLabel: string | null;
  /* Shown only when the ledger holds more than one currency — figures are
     never summed across them. */
  currencies: readonly string[];
  activeCurrency: string;
  onPickCurrency: (currency: string) => void;
  activeCount: number;
  onClearAll: () => void;
  resultLabel: string;
};

const STATUSES: readonly InvoiceStatus[] = ["unpaid", "overdue", "paid"];
const TYPES: readonly PaymentType[] = ["fiat", "bitcoin"];

/**
 * Filters start empty and mean exactly what they look like: nothing selected
 * is nothing filtered. The previous version defaulted every chip to "on",
 * which both read as "three filters applied" and made selected and unselected
 * indistinguishable, since everything was lit at once.
 */
export function FilterBar({
  search,
  onSearch,
  statuses,
  onToggleStatus,
  types,
  onToggleType,
  period,
  onClearPeriod,
  periodLabel,
  currencies,
  activeCurrency,
  onPickCurrency,
  activeCount,
  onClearAll,
  resultLabel,
}: FilterBarProps) {
  const { t } = useI18n();

  const statusLabel = (status: InvoiceStatus) =>
    status === "paid"
      ? t("invoicesList.statusPaid")
      : status === "overdue"
        ? t("invoicesList.statusOverdue")
        : t("invoicesList.statusUnpaid");

  return (
    <div className="filter-bar">
      <div className="search-field">
        <Search />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t("invoicesList.searchPlaceholder")}
          aria-label={t("invoicesList.searchLabel")}
        />
      </div>

      {/* The chips are one scrollable strip on a phone and plain flex children
          on a wide screen (`display: contents`), so the desktop bar keeps the
          single-row alignment it had before. */}
      <div className="filter-chips">
        {STATUSES.map((status) => {
          const on = statuses.has(status);
          return (
            <button
              key={status}
              type="button"
              className="fchip"
              data-tone={status}
              data-on={on}
              aria-pressed={on}
              onClick={() => onToggleStatus(status)}
            >
              {on ? <Check /> : <span className="fchip-dot" />}
              {statusLabel(status)}
            </button>
          );
        })}

        <span className="filter-divider" role="separator" />

        {TYPES.map((type) => {
          const on = types.has(type);
          return (
            <button
              key={type}
              type="button"
              className="fchip"
              data-tone={type === "bitcoin" ? "btc" : "fiat"}
              data-on={on}
              aria-pressed={on}
              onClick={() => onToggleType(type)}
            >
              {on ? <Check /> : <span className="fchip-dot" />}
              {type === "bitcoin"
                ? t("invoicesList.paymentTypeBitcoin")
                : t("invoicesList.paymentTypeFiat")}
            </button>
          );
        })}

        {currencies.length > 1 ? (
          <>
            <span className="filter-divider" role="separator" />
            {currencies.map((code) => (
              <button
                key={code}
                type="button"
                className="fchip mono"
                data-on={code === activeCurrency}
                aria-pressed={code === activeCurrency}
                onClick={() => onPickCurrency(code)}
              >
                {code}
              </button>
            ))}
          </>
        ) : null}

        {period && periodLabel ? (
          <button
            type="button"
            className="fchip fchip-period"
            data-on="true"
            onClick={onClearPeriod}
            title={t("invoicesList.clearPeriod")}
          >
            {periodLabel}
            <X />
          </button>
        ) : null}
      </div>

      <div className="filter-bar-tail">
        {activeCount > 0 ? (
          <button type="button" className="btn-ghost" onClick={onClearAll}>
            <X />
            {t("invoicesList.clearFilters", { count: activeCount })}
          </button>
        ) : null}
        <span className="filter-count">{resultLabel}</span>
      </div>
    </div>
  );
}
