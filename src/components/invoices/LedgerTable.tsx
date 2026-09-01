import { ArrowDown, ArrowUp, Check, RotateCcw, Wallet } from "lucide-react";
import { formatDate, type InvoiceStatus } from "../../lib/invoice";
import { useI18n } from "../../i18n";
import { SortChips } from "./SortChips";

export type SortKey =
  | "invoiceNumber"
  | "clientName"
  | "issueDate"
  | "dueDate"
  | "total";
export type SortDir = "asc" | "desc";

export type LedgerRow = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  paymentDate?: string | null;
  status: InvoiceStatus;
  total: number;
  dueTime: number;
  daysToDue: number | null;
  isBtc: boolean;
  currency: string;
};

type LedgerTableProps = {
  rows: readonly LedgerRow[];
  /* Sorting is optional: a client's own history is rendered in query order,
     and headers and chips that reorder nothing are worse than none — on a
     phone the chips are the only affordance, so a lit one claims an order
     the list does not have. */
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSort?: (key: SortKey) => void;
  onOpen: (id: string) => void;
  onRecordPayment: (row: LedgerRow) => void;
  onUndoPayment: (row: LedgerRow) => void;
  /** Hidden on a client's own page, where every row is the same client. */
  showClient?: boolean;
  formatAmount: (value: number) => string;
  formatMoney: (value: number, currency: string) => string;
  /** Distinct currencies among the visible rows. */
  currencies: readonly string[];
};

type SortHeaderProps = {
  label: string;
  column: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "right";
};

function SortHeader({
  label,
  column,
  activeKey,
  dir,
  onSort,
  align,
}: SortHeaderProps) {
  const active = activeKey === column;
  const arrow = active && dir === "asc" ? <ArrowUp /> : <ArrowDown />;
  return (
    <th style={align === "right" ? { textAlign: "right" } : undefined}>
      <button
        type="button"
        className="ledger-sort"
        data-active={active}
        onClick={() => onSort(column)}
      >
        {align === "right" ? null : label}
        {arrow}
        {align === "right" ? label : null}
      </button>
    </th>
  );
}

export function LedgerTable({
  rows,
  sortKey = "invoiceNumber",
  sortDir = "desc",
  onSort,
  onOpen,
  onRecordPayment,
  onUndoPayment,
  showClient = true,
  formatAmount,
  formatMoney,
  currencies,
}: LedgerTableProps) {
  const { t, tp, locale } = useI18n();

  const header = (label: string, column: SortKey, align?: "right") =>
    onSort ? (
      <SortHeader
        label={label}
        column={column}
        activeKey={sortKey}
        dir={sortDir}
        onSort={onSort}
        align={align}
      />
    ) : (
      <th style={align === "right" ? { textAlign: "right" } : undefined}>
        {label}
      </th>
    );

  /* With one currency in view the code lives in the header and the rows stay
     bare, which keeps the column narrow and the digits aligned. As soon as a
     second currency appears that is a lie, so the header drops it and every
     row carries its own. */
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;

  /**
   * The status cell carries the temporal fact rather than repeating the word
   * the colour rail already encodes: "14 dní po splatnosti" is what you act
   * on; "po splatnosti" next to a due date you have to subtract from today is
   * not.
   */
  const statusCell = (row: LedgerRow) => {
    if (row.status === "paid") {
      return (
        <span className="lstate" data-state="paid">
          <Check />
          {formatDate(row.paymentDate, locale, t("common.placeholderDash"))}
        </span>
      );
    }
    const days = row.daysToDue;
    if (days === null) {
      return <span className="lstate">{t("common.placeholderDash")}</span>;
    }
    if (days < 0) {
      const late = Math.abs(days);
      return (
        <span className="lstate" data-state="overdue">
          {tp("invoicesList.overdueBy", late, { count: late })}
        </span>
      );
    }
    return (
      <span className="lstate" data-state="unpaid">
        {days === 0
          ? t("invoicesList.dueToday")
          : tp("invoicesList.dueIn", days, { count: days })}
      </span>
    );
  };

  const dueLabel = (row: LedgerRow) =>
    row.dueTime
      ? formatDate(new Date(row.dueTime).toISOString(), locale)
      : t("common.placeholderDash");

  /* The one row action, as it appears in both layouts. */
  const rowAction = (row: LedgerRow, className: string) =>
    row.status === "paid" ? (
      <button
        type="button"
        className={className}
        title={t("invoicesList.markUnpaid")}
        aria-label={t("invoicesList.markUnpaid")}
        onClick={() => onUndoPayment(row)}
      >
        <RotateCcw />
      </button>
    ) : (
      <button
        type="button"
        className={className}
        title={t("invoicesList.markPaid")}
        aria-label={t("invoicesList.markPaid")}
        onClick={() => onRecordPayment(row)}
      >
        <Wallet />
      </button>
    );

  const sortKeys: readonly { key: SortKey; label: string }[] = [
    { key: "invoiceNumber", label: t("invoicesList.colNumber") },
    ...(showClient
      ? [{ key: "clientName" as const, label: t("invoicesList.colClient") }]
      : []),
    { key: "issueDate", label: t("invoicesList.colIssued") },
    { key: "dueDate", label: t("invoicesList.colDue") },
    { key: "total", label: t("invoicesList.colAmount") },
  ];

  return (
    <>
      {onSort ? (
        <SortChips
          keys={sortKeys}
          activeKey={sortKey}
          dir={sortDir}
          onPick={onSort}
        />
      ) : null}

      <div className="ledger-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th className="ledger-rail" style={{ borderBottom: 0 }} />
              {header(t("invoicesList.colNumber"), "invoiceNumber")}
              {showClient
                ? header(t("invoicesList.colClient"), "clientName")
                : null}
              {header(t("invoicesList.colIssued"), "issueDate")}
              {header(t("invoicesList.colDue"), "dueDate")}
              <th>{t("invoicesList.colState")}</th>
              {header(
                singleCurrency
                  ? `${t("invoicesList.colAmount")} · ${singleCurrency}`
                  : t("invoicesList.colAmount"),
                "total",
                "right",
              )}
              <th style={{ width: "70px" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                data-status={row.status}
                onClick={() => onOpen(row.id)}
              >
                <td className="ledger-rail">
                  <span />
                </td>
                <td className="ledger-number">
                  {row.invoiceNumber ?? t("common.placeholderDash")}
                  {row.isBtc ? (
                    <span
                      className="ledger-btc"
                      title={t("invoicesList.paymentTypeBitcoin")}
                    >
                      {" ₿"}
                    </span>
                  ) : null}
                </td>
                {showClient ? (
                  <td className="ledger-client">
                    {row.clientName ?? t("common.placeholderDash")}
                  </td>
                ) : null}
                <td className="ledger-date">
                  {formatDate(
                    row.issueDate,
                    locale,
                    t("common.placeholderDash"),
                  )}
                </td>
                <td className="ledger-date" data-late={row.status === "overdue"}>
                  {dueLabel(row)}
                </td>
                <td>{statusCell(row)}</td>
                <td className="ledger-amount">
                  {singleCurrency
                    ? formatAmount(row.total)
                    : formatMoney(row.total, row.currency)}
                </td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div className="ledger-actions">
                    {rowAction(row, "ledger-action")}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Seven columns will not fit a phone, and clipping them silently loses
          the amount and the state — the two facts a row exists to carry. The
          same rows become cards instead, keeping the status rail. */}
      <ul className="lcards">
        {rows.map((row) => (
          <li key={row.id} className="lcard" data-status={row.status}>
            <button
              type="button"
              className="lcard-open"
              onClick={() => onOpen(row.id)}
            >
              <span className="lcard-line">
                <span className="lcard-number mono">
                  {row.invoiceNumber ?? t("common.placeholderDash")}
                  {row.isBtc ? (
                    <span
                      className="ledger-btc"
                      title={t("invoicesList.paymentTypeBitcoin")}
                    >
                      {" ₿"}
                    </span>
                  ) : null}
                </span>
                {/* The table puts the code in its header ("Částka · CZK")
                    and the table is hidden here, so the card has to carry
                    it — otherwise every amount on a phone is a bare
                    figure with no currency at all. */}
                <span className="lcard-amount num">
                  {formatMoney(row.total, row.currency)}
                </span>
              </span>
              {showClient ? (
                <span className="lcard-line">
                  <span className="lcard-client">
                    {row.clientName ?? t("common.placeholderDash")}
                  </span>
                </span>
              ) : null}
              <span className="lcard-line lcard-meta">
                <span className="ledger-date">
                  {formatDate(row.issueDate, locale, t("common.placeholderDash"))}
                  {" → "}
                  <span
                    className="ledger-date"
                    data-late={row.status === "overdue"}
                  >
                    {dueLabel(row)}
                  </span>
                </span>
                {statusCell(row)}
              </span>
            </button>
            {rowAction(row, "lcard-action")}
          </li>
        ))}
      </ul>
    </>
  );
}
