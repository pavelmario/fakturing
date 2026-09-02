import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MAX_SEGMENTS, type MonthCell, type YearSeries } from "../../lib/aging";
import { useI18n } from "../../i18n";

type YearStripProps = {
  series: YearSeries;
  onGoToYear: (year: number) => void;
  activeMonth: number | null;
  onSelectMonth: (month: number | null) => void;
  formatMoney: (value: number) => string;
  /** The one currency the bars are made of. */
  currency: string;
  /** Named only when the ledger holds more than one currency. */
  showCurrency: boolean;
};

/**
 * The year's billing picture, as one panel.
 *
 * The header band is three summary cells that add up — invoiced = paid +
 * unpaid, and the invoice counts add up the same way — so the row reads as a
 * part-to-whole rather than a headline with a legend floated off to one side.
 * The swatches on the two component cells double as the chart's legend.
 *
 * In the plot, each invoice is its own segment, sized by value and separated
 * by a hairline, so a column carries three facts at once: total height is the
 * month's billing, the number of divisions is the invoice count, and colour is
 * whether it has been paid.
 */
export function YearStrip({
  series,
  onGoToYear,
  activeMonth,
  onSelectMonth,
  formatMoney,
  currency,
  showCurrency,
}: YearStripProps) {
  const { t, tp, locale } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);

  const monthName = (month: number) =>
    new Date(series.year, month, 1).toLocaleDateString(locale, {
      month: "short",
    });

  const scale = series.peak > 0 ? series.peak : 1;
  const shown = hovered ?? activeMonth;
  const cell = shown === null ? null : series.months[shown];

  const segmentsFor = (month: MonthCell) =>
    month.invoices.length > MAX_SEGMENTS
      ? [
          { id: "agg-unpaid", total: month.unpaid, paid: false },
          { id: "agg-paid", total: month.paid, paid: true },
        ].filter((segment) => segment.total > 0)
      : month.invoices;

  const cells = [
    {
      key: "invoiced",
      series: null,
      label: t("invoicesList.invoicedTitle"),
      value: series.invoiced,
      count: series.count,
    },
    {
      key: "paid",
      series: "paid",
      label: t("invoicesList.seriesPaid"),
      value: series.paid,
      count: series.paidCount,
    },
    {
      key: "unpaid",
      series: "unpaid",
      label: t("invoicesList.seriesUnpaid"),
      value: series.unpaid,
      count: series.unpaidCount,
    },
  ] as const;

  return (
    <section className="ystrip">
      <div className="ystrip-head">
        <div className="ystrip-nav">
          <button
            type="button"
            className="ystrip-arrow"
            onClick={() => onGoToYear(series.year - 1)}
            aria-label={t("invoicesList.yearPrev")}
            title={String(series.year - 1)}
          >
            <ChevronLeft />
          </button>
          <span className="ystrip-year-label num">{series.year}</span>
          {/* A column cannot stack two currencies, so when the ledger below
              holds both, the chart names the one it is made of. */}
          {showCurrency ? (
            <span
              className="ystrip-currency mono"
              title={t("invoicesList.chartCurrencyNote", { currency })}
            >
              {currency}
            </span>
          ) : null}
          <button
            type="button"
            className="ystrip-arrow"
            onClick={() => onGoToYear(series.year + 1)}
            aria-label={t("invoicesList.yearNext")}
            title={String(series.year + 1)}
          >
            <ChevronRight />
          </button>
        </div>

        {cells.map((summary) => (
          <div
            key={summary.key}
            className="ystrip-cell"
            data-lead={summary.key === "invoiced"}
            data-series={summary.series ?? undefined}
          >
            <div className="ystrip-cell-label">
              {summary.series ? <span className="ystrip-swatch" /> : null}
              {summary.label}
            </div>
            <div className="ystrip-figure">{formatMoney(summary.value)}</div>
            <div className="ystrip-cell-meta">
              <span className="num">{summary.count}</span>{" "}
              {tp("invoicesList.invoiceCount", summary.count)}
            </div>
          </div>
        ))}
      </div>

      <div className="ystrip-plot" onMouseLeave={() => setHovered(null)}>
        {series.months.map((month) => (
          <button
            key={month.month}
            type="button"
            className="ystrip-col"
            data-dim={activeMonth !== null && activeMonth !== month.month}
            data-on={activeMonth === month.month}
            disabled={month.count === 0}
            onMouseEnter={() => setHovered(month.month)}
            onFocus={() => setHovered(month.month)}
            onClick={() =>
              onSelectMonth(activeMonth === month.month ? null : month.month)
            }
            aria-label={`${monthName(month.month)} ${series.year}: ${formatMoney(month.invoiced)}, ${month.count} ${tp("invoicesList.invoiceCount", month.count)}`}
          >
            <span className="ystrip-track">
              <span
                className="ystrip-stack"
                style={{ height: `${(month.invoiced / scale) * 100}%` }}
              >
                {segmentsFor(month).map((segment) => (
                  <span
                    key={segment.id}
                    className="ystrip-seg"
                    data-series={segment.paid ? "paid" : "unpaid"}
                    style={{ flexGrow: Math.max(segment.total, 1) }}
                  />
                ))}
              </span>
            </span>
            <span className="ystrip-label">{monthName(month.month)}</span>
          </button>
        ))}

        {series.count === 0 ? (
          <div className="ystrip-empty">{t("invoicesList.yearEmpty")}</div>
        ) : null}

        {cell && cell.count > 0 ? (
          /* Near either end the tooltip is pinned to the edge instead of
             centred, so it cannot run outside the panel and get clipped. */
          <div
            className="ystrip-tip"
            data-align={
              cell.month <= 1 ? "start" : cell.month >= 10 ? "end" : "center"
            }
            /* A custom property rather than `left` directly: on a phone the
               tip spans the panel instead, and an inline `left` would win. */
            style={
              cell.month <= 1 || cell.month >= 10
                ? undefined
                : ({
                    "--tip-x": `${((cell.month + 0.5) / 12) * 100}%`,
                  } as CSSProperties)
            }
          >
            <div className="ystrip-tip-head">
              {monthName(cell.month)} {series.year}
            </div>
            <div className="ystrip-tip-row" data-series="paid">
              <span className="ystrip-swatch" />
              {t("invoicesList.seriesPaid")}
              <b className="num">{formatMoney(cell.paid)}</b>
            </div>
            <div className="ystrip-tip-row" data-series="unpaid">
              <span className="ystrip-swatch" />
              {t("invoicesList.seriesUnpaid")}
              <b className="num">{formatMoney(cell.unpaid)}</b>
            </div>
            <div className="ystrip-tip-foot">
              <span className="num">{cell.count}</span>{" "}
              {tp("invoicesList.invoiceCount", cell.count)}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
