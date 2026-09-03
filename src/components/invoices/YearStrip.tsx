import { Fragment, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  MAX_SEGMENTS,
  type CurrencyTotals,
  type MonthCell,
  type YearSeries,
} from "../../lib/aging";
import { useI18n } from "../../i18n";

type YearStripProps = {
  series: YearSeries;
  onGoToYear: (year: number) => void;
  activeMonth: number | null;
  onSelectMonth: (month: number | null) => void;
  formatMoney: (value: number, currency?: string) => string;
  /** The one currency the bars are measured in. */
  currency: string;
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
 *
 * An invoice in another currency cannot be sized on this scale without
 * converting it, and nothing here converts. It is drawn anyway — as a hollow
 * cap above the bar, one per invoice, deliberately the same height whatever it
 * is worth. So the column still shows every invoice the month holds and the
 * count matches the ledger below; only the money keeps to one currency.
 *
 * Which currency that is needs no badge of its own: every figure in the header
 * carries its own mark, and each one lists the other currencies underneath it.
 * A standing "CZK" label existed to stop a short column reading as a quiet
 * month — a job the caps now do in the column itself.
 */
export function YearStrip({
  series,
  onGoToYear,
  activeMonth,
  onSelectMonth,
  formatMoney,
  currency,
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

  /* Four caps are 24px of a 64px track; past that the bar has no room left
     and the tooltip carries the exact count anyway. */
  const MAX_CAPS = 4;

  const capsFor = (month: MonthCell) => month.foreign.slice(0, MAX_CAPS);

  const foreignLine = (totals: CurrencyTotals[], pick: keyof CurrencyTotals) =>
    totals
      .filter((entry) => Number(entry[pick]) !== 0)
      .map((entry) => (
        <div
          key={entry.currency}
          className="ystrip-figure-alt num"
          title={t("invoicesList.chartCurrencyNote", { currency })}
        >
          + {formatMoney(Number(entry[pick]), entry.currency)}
        </div>
      ));

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
      pick: "invoiced" as const,
      count: series.count,
    },
    {
      key: "paid",
      series: "paid",
      label: t("invoicesList.seriesPaid"),
      value: series.paid,
      pick: "paid" as const,
      count: series.paidCount,
    },
    {
      key: "unpaid",
      series: "unpaid",
      label: t("invoicesList.seriesUnpaid"),
      value: series.unpaid,
      pick: "unpaid" as const,
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
            {foreignLine(series.foreignTotals, summary.pick)}
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
            aria-label={[
              `${monthName(month.month)} ${series.year}: ${formatMoney(month.invoiced)}`,
              ...month.foreignTotals.map((entry) =>
                formatMoney(entry.invoiced, entry.currency),
              ),
              `${month.count} ${tp("invoicesList.invoiceCount", month.count)}`,
            ].join(", ")}
          >
            <span className="ystrip-track">
              <span className="ystrip-bar">
                {capsFor(month).map((invoice) => (
                  <span
                    key={invoice.id}
                    className="ystrip-cap"
                    data-series={invoice.paid ? "paid" : "unpaid"}
                    title={t("invoicesList.chartCurrencyNote", { currency })}
                  />
                ))}
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
            {/* Split by state, as the colours are — another currency is not a
                third state of an invoice. It goes under the state it is in,
                on its own line because it cannot be added to the one above. */}
            {(
              [
                {
                  key: "paid",
                  label: t("invoicesList.seriesPaid"),
                  value: cell.paid,
                },
                {
                  key: "unpaid",
                  label: t("invoicesList.seriesUnpaid"),
                  value: cell.unpaid,
                },
              ] as const
            ).map((row) => (
              <Fragment key={row.key}>
                <div className="ystrip-tip-row" data-series={row.key}>
                  <span className="ystrip-swatch" />
                  {row.label}
                  <b className="num">{formatMoney(row.value)}</b>
                </div>
                {cell.foreignTotals
                  .filter((entry) => entry[row.key] !== 0)
                  .map((entry) => (
                    <div key={entry.currency} className="ystrip-tip-alt num">
                      + {formatMoney(entry[row.key], entry.currency)}
                    </div>
                  ))}
              </Fragment>
            ))}
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
