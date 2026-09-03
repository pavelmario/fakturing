import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { Plus, UserRound } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { PaymentDialog } from "./PaymentDialog";
import {
  FilterBar,
  type PaymentType,
  type PeriodFilter,
} from "./invoices/FilterBar";
import { OverduePanel } from "./invoices/OverduePanel";
import { YearStrip } from "./invoices/YearStrip";
import {
  LedgerTable,
  type LedgerRow,
  type SortDir,
  type SortKey,
} from "./invoices/LedgerTable";
import { computeYearSeries } from "../lib/aging";
import {
  daysUntilDue,
  invoiceStatus,
  invoiceTotal,
  invoiceYear,
  parseItems,
  type InvoiceStatus,
} from "../lib/invoice";
import {
  DEFAULT_CURRENCY,
  formatAmount,
  formatMoney,
  sumByCurrency,
} from "../lib/money";
import { useNotify } from "../lib/confirmContext";

type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  paymentDate?: string | null;
  paymentDays: number | null;
  invoicingNote?: string | null;
  btcInvoice?: number | null;
  currency?: string | null;
  items: unknown;
};

type InvoiceListPageProps = {
  onCreateInvoice: () => void;
  onViewDetails: (invoiceId: string) => void;
  onOpenProfile: () => void;
};

type DecoratedRow = LedgerRow & {
  paymentDays: number | null;
  invoicingNote?: string | null;
};

export function InvoiceListPage({
  onCreateInvoice,
  onViewDetails,
  onOpenProfile,
}: InvoiceListPageProps) {
  const { t, tp, locale } = useI18n();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  /* Every filter starts empty — nothing selected means nothing filtered. */
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ReadonlySet<InvoiceStatus>>(
    new Set(),
  );
  const [types, setTypes] = useState<ReadonlySet<PaymentType>>(new Set());
  const [period, setPeriod] = useState<PeriodFilter>(null);
  /* Amounts are never converted, so a currency narrows what is summed.
     Nothing picked means every currency is in view — the chips toggle, so a
     pick can always be undone. */
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("invoiceNumber");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [payingInvoice, setPayingInvoice] = useState<DecoratedRow | null>(null);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["discreteMode", "vatPayer", "name"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const profileRows = useQuery(profileQuery);
  const isDiscreteMode = profileRows[0]?.discreteMode === Evolu.sqliteTrue;
  const isVatPayer = profileRows[0]?.vatPayer === Evolu.sqliteTrue;
  /* Without a profile an invoice prints with no supplier, no bank details and
     no payment QR — worth saying before the first one is written, not after. */
  const hasProfile = Boolean(profileRows[0]?.name?.trim());

  const invoicesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select([
            "id",
            "invoiceNumber",
            "clientName",
            "issueDate",
            "paymentDate",
            "paymentDays",
            "invoicingNote",
            "btcInvoice",
            "currency",
            "items",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("invoiceNumber", "desc"),
      ),
    [evolu, owner.id],
  );

  const invoices = useQuery(invoicesQuery) as readonly InvoiceRow[];

  const rows = useMemo<DecoratedRow[]>(
    () =>
      invoices.map((invoice) => {
        const items = parseItems(invoice.items);
        const issued = invoice.issueDate ? new Date(invoice.issueDate) : null;
        const valid = issued !== null && !Number.isNaN(issued.getTime());
        return {
          ...invoice,
          currency: invoice.currency || DEFAULT_CURRENCY,
          total: invoiceTotal(items, isVatPayer),
          status: invoiceStatus(invoice),
          dueTime:
            valid && issued
              ? new Date(issued).setDate(
                  issued.getDate() + Number(invoice.paymentDays ?? 0),
                )
              : 0,
          daysToDue: daysUntilDue(invoice.issueDate, invoice.paymentDays),
          isBtc: invoice.btcInvoice === Evolu.sqliteTrue,
        };
      }),
    [invoices, isVatPayer],
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const invoice of invoices) {
      const year = invoiceYear(invoice.issueDate);
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [invoices]);

  const currencies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.currency, (counts.get(row.currency) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code);
  }, [rows]);

  /* null is a real state: the whole ledger, CZK and EUR side by side. */
  const activeCurrency =
    pickedCurrency && currencies.includes(pickedCurrency)
      ? pickedCurrency
      : null;

  /* Bars cannot stack two currencies, so with none picked the chart falls
     back to the ledger's dominant one and says which in its header. */
  const chartCurrency = activeCurrency ?? currencies[0] ?? DEFAULT_CURRENCY;

  const scoped = useMemo(
    () =>
      activeCurrency
        ? rows.filter((row) => row.currency === activeCurrency)
        : rows,
    [activeCurrency, rows],
  );

  const currentYear = new Date().getFullYear();
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  /* Any year is reachable — an empty one simply renders as an empty year.
     Only the starting point is derived from the data. */
  const chartYear =
    pickedYear ??
    availableYears.find((year) => year === currentYear) ??
    availableYears[availableYears.length - 1] ??
    currentYear;

  /* Every row in scope, with the chart's currency named: the bars are drawn
     from that one, and the rest are counted beside them rather than dropped —
     the strip used to say "18 faktur" over a ledger listing 19. */
  const yearSeries = useMemo(
    () => computeYearSeries(scoped, chartYear, chartCurrency),
    [scoped, chartCurrency, chartYear],
  );

  /**
   * The year on the strip is a scope, not a filter — the same way the
   * currency chips are.
   *
   * It used to move only the chart, so importing a back year dropped its
   * invoices into a ledger headed by a different year, and the strip could
   * read 2026 above a table of 2025 rows.
   */
  const inYear = useMemo(
    () => scoped.filter((row) => invoiceYear(row.issueDate) === chartYear),
    [chartYear, scoped],
  );

  /* Lateness in aggregate exists only while something is late. */
  const overdue = useMemo(
    () => inYear.filter((row) => row.status === "overdue"),
    [inYear],
  );
  const overdueTotals = useMemo(() => sumByCurrency(overdue), [overdue]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return inYear.filter((row) => {
      if (statuses.size > 0 && !statuses.has(row.status)) return false;
      if (types.size > 0 && !types.has(row.isBtc ? "bitcoin" : "fiat")) {
        return false;
      }
      /* The year is already the scope, so a period narrows to its month. */
      if (period?.month != null) {
        const issued = row.issueDate ? new Date(row.issueDate) : null;
        if (!issued || Number.isNaN(issued.getTime())) return false;
        if (issued.getMonth() !== period.month) return false;
      }
      if (needle) {
        const haystack = [row.invoiceNumber, row.clientName, row.invoicingNote]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [inYear, period, search, statuses, types]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "clientName":
          return (
            dir * (a.clientName ?? "").localeCompare(b.clientName ?? "", locale)
          );
        case "issueDate":
          return (
            dir *
            (new Date(a.issueDate ?? 0).getTime() -
              new Date(b.issueDate ?? 0).getTime())
          );
        case "dueDate":
          return dir * (a.dueTime - b.dueTime);
        case "total":
          return dir * (a.total - b.total);
        default:
          return (
            dir *
            (a.invoiceNumber ?? "").localeCompare(
              b.invoiceNumber ?? "",
              locale,
              { numeric: true },
            )
          );
      }
    });
    return list;
  }, [filtered, locale, sortDir, sortKey]);

  /* What the table is actually showing, which is not always the pick: a
     status or month filter can leave one currency standing on its own. */
  const visibleCurrencies = useMemo(
    () => [...new Set(sorted.map((row) => row.currency))],
    [sorted],
  );

  /* Defaults to the chart's currency, so every aggregate prints its own
     currency rather than assuming CZK. */
  const money = (value: number, currency: string = chartCurrency) =>
    isDiscreteMode
      ? t("common.discreteMask")
      : formatMoney(value, locale, currency);

  const amount = (value: number) =>
    isDiscreteMode ? t("common.discreteMask") : formatAmount(value, locale);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "clientName" ? "asc" : "desc");
    }
  };

  const activeCount =
    statuses.size +
    types.size +
    (period ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const clearAll = () => {
    setStatuses(new Set());
    setTypes(new Set());
    setPeriod(null);
    setSearch("");
  };

  const onlyOverdue = statuses.size === 1 && statuses.has("overdue");

  const periodLabel = period
    ? period.month === null
      ? String(period.year)
      : `${new Date(period.year, period.month, 1).toLocaleDateString(locale, {
          month: "long",
        })} ${period.year}`
    : null;

  const confirmPayment = (invoice: DecoratedRow, date: string) => {
    const parsed = Evolu.dateToDateIso(new Date(`${date}T12:00:00`));
    if (!parsed.ok) {
      console.error("Payment date error:", parsed.error);
      notify(t("invoicesList.alertPaymentDateError"), "error");
      return;
    }
    const result = evolu.update("invoice", {
      id: invoice.id,
      paymentDate: parsed.value,
    });
    if (!result.ok) {
      console.error("Payment update error:", result.error);
      notify(t("invoicesList.alertPaymentUpdateError"), "error");
      return;
    }
    setPayingInvoice(null);
  };

  const undoPayment = (invoice: LedgerRow) => {
    const result = evolu.update("invoice", {
      id: invoice.id,
      paymentDate: null,
    });
    if (!result.ok) {
      console.error("Payment cancel error:", result.error);
      notify(t("alerts.paymentCancelFailed"), "error");
    }
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-head">
          <h1 className="page-title">{t("invoicesList.title")}</h1>
          <button onClick={onCreateInvoice} className="btn-primary">
            <Plus />
            {t("invoicesList.create")}
          </button>
        </div>

        {!hasProfile ? (
          <button
            type="button"
            className="setup-prompt"
            onClick={onOpenProfile}
          >
            <UserRound />
            <span>{t("invoicesList.setupProfile")}</span>
            <span className="setup-cta">{t("invoicesList.setupProfileCta")}</span>
          </button>
        ) : null}

        <OverduePanel
          count={overdue.length}
          totals={overdueTotals}
          active={onlyOverdue}
          onToggle={() =>
            setStatuses(onlyOverdue ? new Set() : new Set(["overdue"]))
          }
          formatMoney={money}
        />

        {invoices.length > 0 ? (
          <div className="mb-4">
            <YearStrip
              series={yearSeries}
              /* A month picked in the old year would filter the new one to
                 nothing, so stepping years drops it. */
              onGoToYear={(year) => {
                setPickedYear(year);
                setPeriod(null);
              }}
              activeMonth={
                period && period.year === chartYear ? period.month : null
              }
              onSelectMonth={(month) =>
                setPeriod(month === null ? null : { year: chartYear, month })
              }
              formatMoney={money}
              currency={chartCurrency}
            />
          </div>
        ) : null}

        <FilterBar
          search={search}
          onSearch={setSearch}
          statuses={statuses}
          onToggleStatus={(status) =>
            setStatuses((prev) => {
              const next = new Set(prev);
              if (next.has(status)) next.delete(status);
              else next.add(status);
              return next;
            })
          }
          types={types}
          onToggleType={(type) =>
            setTypes((prev) => {
              const next = new Set(prev);
              if (next.has(type)) next.delete(type);
              else next.add(type);
              return next;
            })
          }
          period={period}
          periodLabel={periodLabel}
          onClearPeriod={() => setPeriod(null)}
          activeCount={activeCount}
          currencies={currencies}
          activeCurrency={activeCurrency}
          /* Clicking the lit chip clears it, the way every other chip
             behaves — otherwise a pick is a one-way door. */
          onPickCurrency={(code) =>
            setPickedCurrency((prev) => (prev === code ? null : code))
          }
          onClearAll={clearAll}
          resultLabel={
            activeCount > 0
              ? t("invoicesList.rowCount", {
                  shown: sorted.length,
                  /* What the scope can reach, not what the database holds —
                     "3 of 42" under a year showing 11 was a puzzle. */
                  total: inYear.length,
                })
              : `${inYear.length} ${tp("invoicesList.invoiceCount", inYear.length)}`
          }
        />

        {sorted.length === 0 ? (
          <div className="empty-state">
            {invoices.length === 0
              ? t("invoicesList.emptyNone")
              : t("invoicesList.emptyNoMatch")}
          </div>
        ) : (
          <LedgerTable
            rows={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            onOpen={onViewDetails}
            onRecordPayment={(row) => setPayingInvoice(row as DecoratedRow)}
            onUndoPayment={undoPayment}
            formatAmount={amount}
            formatMoney={money}
            currencies={visibleCurrencies}
          />
        )}
      </div>

      {payingInvoice ? (
        <PaymentDialog
          invoiceNumber={
            payingInvoice.invoiceNumber ?? t("common.placeholderDash")
          }
          clientName={payingInvoice.clientName ?? ""}
          amount={money(payingInvoice.total, payingInvoice.currency)}
          onConfirm={(date) => confirmPayment(payingInvoice, date)}
          onCancel={() => setPayingInvoice(null)}
        />
      ) : null}
    </div>
  );
}
