import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { ChevronLeft, ChevronRight, FileDown, Plus, Search } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { formatDate } from "../lib/invoice";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";
import { useNotify } from "../lib/confirmContext";
import { useCompactLayout } from "../lib/useCompactLayout";

type ExpensesListPageProps = {
  onCreateExpense: () => void;
  onViewDetails: (expenseId: string) => void;
};

type ExpenseRow = {
  id: string;
  amountWithoutVat: number | null;
  amountWithVat: number | null;
  vatRate: number | null;
  supplierVat: string | null;
  expenseNumber: string | null;
  description: string | null;
  expenseDate: string | null;
};




const toDateCz = (iso: string): string => {
  const d = new Date(iso);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

const stripCzPrefix = (vat: string): string =>
  vat.replace(/^CZ/i, "").trim();

const escapeXmlAttr = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const parseObecFromZipCity = (value: string | null | undefined): string => {
  if (!value) return "";

  let normalized = value.replace(/\u00A0/g, " ").trim();
  if (!normalized) return "";

  normalized = normalized.replace(/^,?\s*/, "");
  normalized = normalized.replace(/^\d{3}\s?\d{2}\s*,?\s*/, "");
  normalized = normalized.replace(/^\d{5}\s*,?\s*/, "");
  normalized = normalized.trim();
  if (!normalized) return "";

  const cityPart = normalized.split(/\s*[-–—]\s*/)[0]?.trim() ?? "";
  if (!cityPart) return "";

  return cityPart.replace(/\s+\d+\s*$/, "").trim();
};
export function ExpensesListPage({
  onCreateExpense,
  onViewDetails,
}: ExpensesListPageProps) {
  const { t, tp, locale } = useI18n();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const compact = useCompactLayout();

  const [search, setSearch] = useState("");
  /* Expenses are entered through the month and then filed for a period, so the
     period is the page's primary control rather than a pair of date fields
     hidden inside a collapsed filter panel — which is where the control
     statement export used to get its range from. */
  const now = new Date();
  const [period, setPeriod] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  /* null = the whole period; otherwise a plain text search across everything */
  const [browseAll, setBrowseAll] = useState(false);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );
  const profile = useQuery(profileQuery)[0] ?? null;
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;
  const isDiscreteMode = profile?.discreteMode === Evolu.sqliteTrue;

  const expensesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expense")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("expenseDate", "desc"),
      ),
    [evolu, owner.id],
  );
  const expenses = useQuery(expensesQuery) as readonly ExpenseRow[];

  const pad = (value: number) => String(value + 1).padStart(2, "0");
  const lastDay = new Date(period.year, period.month + 1, 0).getDate();
  /* The export function below reads these two names, unchanged. */
  const dateFrom = `${period.year}-${pad(period.month)}-01`;
  const dateTo = `${period.year}-${pad(period.month)}-${String(lastDay).padStart(2, "0")}`;

  const inPeriod = (expense: ExpenseRow) => {
    if (!expense.expenseDate) return false;
    const date = new Date(expense.expenseDate);
    if (Number.isNaN(date.getTime())) return false;
    return (
      date.getFullYear() === period.year && date.getMonth() === period.month
    );
  };

  const dateRangeExpenses = useMemo(
    () => expenses.filter(inPeriod),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, period.year, period.month],
  );

  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => {
    /* Search stays inside the chosen period unless "vše" is on. Widening it
       silently put rows from other months in the table while the panel above
       kept totalling the period — two different sets, described as one. */
    const base = browseAll ? expenses : dateRangeExpenses;
    if (!needle) return base;
    return base.filter((expense) =>
      [expense.description, expense.expenseNumber, expense.supplierVat]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [browseAll, dateRangeExpenses, expenses, needle]);

  const totals = useMemo(() => {
    let base = 0;
    let vat = 0;
    let gross = 0;
    for (const expense of dateRangeExpenses) {
      const withVat = Number(expense.amountWithVat ?? 0);
      const withoutVat = Number(expense.amountWithoutVat ?? 0);
      gross += Number.isFinite(withVat) ? withVat : 0;
      base += Number.isFinite(withoutVat) ? withoutVat : 0;
    }
    vat = gross - base;
    return { base, vat, gross, count: dateRangeExpenses.length };
  }, [dateRangeExpenses]);

  const yearTotal = useMemo(
    () =>
      expenses.reduce((sum, expense) => {
        if (!expense.expenseDate) return sum;
        const date = new Date(expense.expenseDate);
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== period.year) {
          return sum;
        }
        const value = Number(expense.amountWithVat ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [expenses, period.year],
  );

  const money = (value: number) =>
    isDiscreteMode
      ? t("common.discreteMask")
      : formatMoney(value, locale, DEFAULT_CURRENCY);
  const amount = (value: number) =>
    isDiscreteMode ? t("common.discreteMask") : formatAmount(value, locale);

  const shiftPeriod = (delta: number) => {
    const next = new Date(period.year, period.month + delta, 1);
    setPeriod({ year: next.getFullYear(), month: next.getMonth() });
    setBrowseAll(false);
  };

  const periodLabel = new Date(period.year, period.month, 1).toLocaleDateString(
    locale,
    { month: "long", year: "numeric" },
  );

  const handleExportKontrolniHlaseni = () => {
    if (!dateFrom || !dateTo) {
      notify(t("expensesList.exportXmlMissingDates"), "error");
      return;
    }

    const vatNumber = profile?.vatNumber?.toString().trim() ?? "";
    if (!vatNumber) {
      notify(t("expensesList.exportXmlMissingVat"), "error");
      return;
    }

    const taxOfficeCode = profile?.taxOfficeCode?.toString().trim() ?? "";
    if (!taxOfficeCode) {
      notify(t("expensesList.exportXmlMissingTaxOffice"), "error");
      return;
    }
    const taxOfficeWorkplaceCode =
      profile?.taxOfficeWorkplaceCode?.toString().trim() ?? "";

    const dic = stripCzPrefix(vatNumber);
    const fullName = profile?.name?.toString().trim() ?? "";
    const obec = parseObecFromZipCity(profile?.addressLine2?.toString());
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] ?? "";
    const lastName =
      nameParts.length > 1 ? nameParts.slice(1).join(" ") : firstName;
    const periodDate = new Date(dateFrom);
    const rok = periodDate.getFullYear();
    const mesic = periodDate.getMonth() + 1;
    const today = toDateCz(new Date().toISOString().slice(0, 10));

    const above10k = dateRangeExpenses.filter(
      (e) => Number(e.amountWithVat ?? 0) > 10000,
    );
    const atOrBelow10k = dateRangeExpenses.filter(
      (e) => Number(e.amountWithVat ?? 0) <= 10000,
    );

    const missingInfo = above10k.some(
      (e) => !e.supplierVat?.toString().trim() || !e.expenseNumber?.toString().trim(),
    );
    if (missingInfo) {
      notify(t("expensesList.exportXmlMissingSupplierInfo"), "error");
      return;
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;

    const normalizeVatRate = (vatRate: number): 21 | 12 | 10 => {
      if (!Number.isFinite(vatRate) || vatRate <= 0) return 21;
      const candidates = [vatRate, vatRate * 10, vatRate * 100];
      const allowedRates: Array<21 | 12 | 10> = [21, 12, 10];

      let bestRate: 21 | 12 | 10 = 21;
      let bestDiff = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        for (const allowedRate of allowedRates) {
          const diff = Math.abs(candidate - allowedRate);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestRate = allowedRate;
          }
        }
      }

      return bestRate;
    };

    const computeVatSplit = (expense: ExpenseRow) => {
      const amountWithVat = Number(expense.amountWithVat ?? 0);
      const amountWithoutVat = Number(expense.amountWithoutVat ?? Number.NaN);
      const normalizedVatRate = normalizeVatRate(Number(expense.vatRate ?? 21));
      const rateBand = normalizedVatRate === 21 ? 21 : 12;

      if (Number.isFinite(amountWithoutVat) && amountWithoutVat >= 0) {
        const zaklDane = round2(amountWithoutVat);
        const dan = round2((zaklDane * rateBand) / 100);
        return { zaklDane, dan, rateBand };
      }

      const zaklDane = round2(amountWithVat / (1 + rateBand / 100));
      const dan = round2(amountWithVat - zaklDane);
      return { zaklDane, dan, rateBand };
    };

    const b2Lines: string[] = [];
    const b2Sums = { zakl_dane1: 0, dan1: 0, zakl_dane2: 0, dan2: 0 };
    for (let i = 0; i < above10k.length; i++) {
      const e = above10k[i];
      const { zaklDane, dan, rateBand } = computeVatSplit(e);
      const dicDod = stripCzPrefix(e.supplierVat?.toString() ?? "");
      const cEvidDd = escapeXmlAttr(e.expenseNumber?.toString() ?? "");
      const dppd = toDateCz(e.expenseDate ?? "");

      const rateAttrs =
        rateBand === 12
          ? `zakl_dane2="${zaklDane.toFixed(2)}" dan2="${dan.toFixed(2)}"`
          : `zakl_dane1="${zaklDane.toFixed(2)}" dan1="${dan.toFixed(2)}"`;

      if (rateBand === 12) {
        b2Sums.zakl_dane2 += zaklDane;
        b2Sums.dan2 += dan;
      } else {
        b2Sums.zakl_dane1 += zaklDane;
        b2Sums.dan1 += dan;
      }

      b2Lines.push(
        `    <VetaB2 c_radku="${i + 1}" dic_dod="${escapeXmlAttr(dicDod)}" c_evid_dd="${cEvidDd}" dppd="${dppd}" ${rateAttrs} pomer="N" zdph_44="N" />`,
      );
    }

    const b3Sums = { zakl_dane1: 0, dan1: 0, zakl_dane2: 0, dan2: 0 };
    for (const e of atOrBelow10k) {
      const amountWithVat = Number(e.amountWithVat ?? 0);
      if (amountWithVat <= 0) continue;
      const { zaklDane, dan, rateBand } = computeVatSplit(e);
      if (rateBand === 12) {
        b3Sums.zakl_dane2 += zaklDane;
        b3Sums.dan2 += dan;
      } else {
        b3Sums.zakl_dane1 += zaklDane;
        b3Sums.dan1 += dan;
      }
    }

    const hasB3 =
      b3Sums.zakl_dane1 !== 0 ||
      b3Sums.dan1 !== 0 ||
      b3Sums.zakl_dane2 !== 0 ||
      b3Sums.dan2 !== 0;

    const b3Attrs: string[] = [];
    if (b3Sums.zakl_dane1 !== 0 || b3Sums.dan1 !== 0) {
      b3Attrs.push(`zakl_dane1="${b3Sums.zakl_dane1.toFixed(2)}"`);
      b3Attrs.push(`dan1="${b3Sums.dan1.toFixed(2)}"`);
    }
    if (b3Sums.zakl_dane2 !== 0 || b3Sums.dan2 !== 0) {
      b3Attrs.push(`zakl_dane2="${b3Sums.zakl_dane2.toFixed(2)}"`);
      b3Attrs.push(`dan2="${b3Sums.dan2.toFixed(2)}"`);
    }

    const b3Line = hasB3
      ? `    <VetaB3 ${b3Attrs.join(" ")} />`
      : "";

    const cPln23 = b2Sums.zakl_dane1 + b3Sums.zakl_dane1;
    const cPln5 = b2Sums.zakl_dane2 + b3Sums.zakl_dane2;
    const hasC = cPln23 !== 0 || cPln5 !== 0;
    const cAttrs: string[] = [];
    if (cPln23 !== 0) cAttrs.push(`pln23="${cPln23.toFixed(2)}"`);
    if (cPln5 !== 0) cAttrs.push(`pln5="${cPln5.toFixed(2)}"`);
    const cLine = hasC ? `    <VetaC ${cAttrs.join(" ")} />` : "";
    const vetaPAttrs = [
      `c_ufo="${escapeXmlAttr(taxOfficeCode)}"`,
      ...(taxOfficeWorkplaceCode
        ? [`c_pracufo="${escapeXmlAttr(taxOfficeWorkplaceCode)}"`]
        : []),
      `dic="${escapeXmlAttr(dic)}"`,
      `typ_ds="F"`,
      ...(obec ? [`naz_obce="${escapeXmlAttr(obec)}"`] : []),
      ...(firstName ? [`jmeno="${escapeXmlAttr(firstName)}"`] : []),
      ...(lastName ? [`prijmeni="${escapeXmlAttr(lastName)}"`] : []),
    ].join(" ");

    const xmlParts = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<Pisemnost nazevSW="Fakturing" verzeSW="1.0">`,
      `  <DPHKH1 verzePis="02.01">`,
      `    <VetaD dokument="KH1" k_uladis="DPH" rok="${rok}" mesic="${mesic}" khdph_forma="B" d_poddp="${today}" />`,
      `    <VetaP ${vetaPAttrs} />`,
      ...b2Lines,
      ...(b3Line ? [b3Line] : []),
      ...(cLine ? [cLine] : []),
      `  </DPHKH1>`,
      `</Pisemnost>`,
    ];

    const xml = xmlParts.join("\n");
    const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kontrolni-hlaseni-${rok}-${String(mesic).padStart(2, "0")}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-head">
          <h1 className="page-title">{t("expensesList.title")}</h1>
          <button onClick={onCreateExpense} className="btn-primary">
            <Plus />
            {t("expensesList.create")}
          </button>
        </div>

        {/* ---- The filing period drives the page ---------------------- */}
        <section className="ystrip mb-4">
          <div className="ystrip-head">
            <div className="ystrip-nav">
              <button
                type="button"
                className="ystrip-arrow"
                onClick={() => shiftPeriod(-1)}
                aria-label={t("expensesList.periodPrev")}
              >
                <ChevronLeft />
              </button>
              <span className="period-label">{periodLabel}</span>
              <button
                type="button"
                className="ystrip-arrow"
                onClick={() => shiftPeriod(1)}
                aria-label={t("expensesList.periodNext")}
              >
                <ChevronRight />
              </button>
            </div>

            <div className="ystrip-cell" data-lead="true">
              <div className="ystrip-cell-label">
                {t("expensesList.periodTotal")}
              </div>
              <div className="ystrip-figure">{money(totals.gross)}</div>
              <div className="ystrip-cell-meta">
                <span className="num">{totals.count}</span>{" "}
                {tp("expensesList.expenseCount", totals.count)}
              </div>
            </div>

            {isVatPayer ? (
              <div className="ystrip-cell">
                <div className="ystrip-cell-label">
                  {t("expensesList.periodVat")}
                </div>
                <div className="ystrip-figure">{money(totals.vat)}</div>
                <div className="ystrip-cell-meta">
                  {t("expensesList.periodBase", { amount: money(totals.base) })}
                </div>
              </div>
            ) : null}

            <div className="ystrip-cell">
              <div className="ystrip-cell-label">
                {t("expensesList.yearTotal", { year: period.year })}
              </div>
              <div className="ystrip-figure">{money(yearTotal)}</div>
            </div>
          </div>

          {isVatPayer ? (
            <div className="period-actions">
              <button
                className="btn-secondary"
                onClick={handleExportKontrolniHlaseni}
              >
                <FileDown />
                {t("expensesList.exportXml")}
              </button>
              <span className="settings-help-text">
                {t("expensesList.exportXmlHint", { period: periodLabel })}
              </span>
            </div>
          ) : null}
        </section>

        <div className="filter-bar">
          <div className="search-field">
            <Search />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("expensesList.searchPlaceholder")}
              aria-label={t("expensesList.searchLabel")}
            />
          </div>
          <div className="filter-chips">
            <button
              type="button"
              className="fchip"
              data-on={browseAll}
              aria-pressed={browseAll}
              onClick={() => setBrowseAll((on) => !on)}
            >
              {t("expensesList.showAll")}
            </button>
          </div>
          <div className="filter-bar-tail">
            <span className="filter-count">
              {visible.length} {tp("expensesList.expenseCount", visible.length)}
            </span>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="empty-state">
            {expenses.length === 0
              ? t("expensesList.emptyNone")
              : t("expensesList.emptyNoMatch")}
          </div>
        ) : (
          <>
            {compact ? null : (
            <div className="ledger-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="ledger-rail" style={{ borderBottom: 0 }} />
                  <th>{t("expensesList.colDate")}</th>
                  <th>{t("expensesList.colDescription")}</th>
                  <th>{t("expensesList.colNumber")}</th>
                  {isVatPayer ? (
                    <>
                      <th>{t("expensesList.colSupplier")}</th>
                      <th className="num-col">{t("expensesList.colBase")}</th>
                      <th className="num-col">{t("expensesList.colVat")}</th>
                    </>
                  ) : null}
                  <th className="num-col">
                    {t("expensesList.colTotal")} · {DEFAULT_CURRENCY}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((expense) => {
                  const gross = Number(expense.amountWithVat ?? 0);
                  const base = Number(expense.amountWithoutVat ?? 0);
                  return (
                    <tr
                      key={expense.id}
                      data-status="unpaid"
                      onClick={() => onViewDetails(expense.id)}
                    >
                      <td className="ledger-rail">
                        <span />
                      </td>
                      <td className="ledger-date">
                        {formatDate(
                          expense.expenseDate,
                          locale,
                          t("common.placeholderDash"),
                        )}
                      </td>
                      <td className="ledger-client">{expense.description}</td>
                      <td className="ledger-date">
                        {expense.expenseNumber || t("common.placeholderDash")}
                      </td>
                      {isVatPayer ? (
                        <>
                          <td className="ledger-date">
                            {expense.supplierVat || t("common.placeholderDash")}
                          </td>
                          <td className="ledger-amount">{amount(base)}</td>
                          <td className="ledger-amount">
                            {amount(gross - base)}
                          </td>
                        </>
                      ) : null}
                      <td className="ledger-amount">{amount(gross)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            )}

            {/* A VAT payer's row carries eight columns; on a phone the same
                document becomes a card — the document on the first two lines,
                the two VAT figures on a third. */}
            {compact ? (
            <ul className="lcards">
              {visible.map((expense) => {
                const gross = Number(expense.amountWithVat ?? 0);
                const base = Number(expense.amountWithoutVat ?? 0);
                return (
                  <li key={expense.id} className="lcard" data-status="unpaid">
                    <button
                      type="button"
                      className="lcard-open"
                      onClick={() => onViewDetails(expense.id)}
                    >
                      <span className="lcard-line">
                        <span className="lcard-client">
                          {expense.description}
                        </span>
                        {/* The table's header carries the currency
                            ("Celkem · CZK") and is hidden here. */}
                        <span className="lcard-amount num">{money(gross)}</span>
                      </span>
                      <span className="lcard-line lcard-meta">
                        <span className="ledger-date">
                          {formatDate(
                            expense.expenseDate,
                            locale,
                            t("common.placeholderDash"),
                          )}
                          {expense.expenseNumber
                            ? ` · ${expense.expenseNumber}`
                            : ""}
                        </span>
                        {isVatPayer && expense.supplierVat ? (
                          <span className="ledger-date mono">
                            {expense.supplierVat}
                          </span>
                        ) : null}
                      </span>
                      {isVatPayer ? (
                        <span className="lcard-line lcard-meta">
                          <span className="ledger-date">
                            {t("expensesList.colBase")} {amount(base)}
                          </span>
                          <span className="ledger-date">
                            {t("expensesList.colVat")} {amount(gross - base)}
                          </span>
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
