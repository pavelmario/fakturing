import { use, useMemo, useRef, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { ChevronLeft, ChevronRight, FileDown, Plus, Search } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { formatDate } from "../lib/invoice";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";
import { useNotify } from "../lib/confirmContext";
import { useCompactLayout } from "../lib/useCompactLayout";
import {
  addBands,
  bandsAreEmpty,
  expenseAmountsOf,
  expenseItems,
  expenseVatBands,
  hasNothingToReport,
  supplierLabel,
  type ExpenseItem,
} from "../lib/expense";
import { parseSupplierVatPrefill } from "../supplierVatPrefill";
import {
  RecurringPanel,
  type ExpenseTemplateRow,
} from "./expenses/RecurringPanel";

type ExpensesListPageProps = {
  onCreateExpense: () => void;
  onViewDetails: (expenseId: string) => void;
  onCreateTemplate: () => void;
  onEditTemplate: (templateId: string) => void;
};

type ExpenseRow = {
  id: string;
  amountWithoutVat: number | null;
  amountWithVat: number | null;
  vatRate: number | null;
  supplierName: string | null;
  supplierVat: string | null;
  supplierIco: string | null;
  expenseNumber: string | null;
  description: string | null;
  expenseDate: string | null;
  items: unknown;
  templateId: string | null;
};

/**
 * A row with its lines read once.
 *
 * The `items` JSON was being parsed about five times per expense per render —
 * in the search filter across every row on each keystroke, in the period
 * totals, in the year total, and twice more per rendered row. Everything
 * below works from this instead. `items` deliberately keeps its name: the
 * parser passes an array straight through, so the helpers that take a whole
 * row still work and no longer re-read anything.
 */
type DecoratedExpense = Omit<ExpenseRow, "items"> & {
  items: ExpenseItem[];
  amounts: { net: number; vat: number; gross: number };
  lineCount: number;
  haystack: string;
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
  onCreateTemplate,
  onEditTemplate,
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
  /* What this session has already booked, keyed by template and period.
     `booked` below is derived from a query that updates a tick later, so a
     second click would otherwise re-run against a stale set and write the
     rent twice. State cannot do this: both of its updates land in the same
     batch, so no render ever observes them. */
  const generated = useRef(new Set<string>());

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
  /* Expenses recorded before there was a supplier field carry only a DIČ;
     the list in Settings is what turns those back into a name. */
  const knownSuppliers = useMemo(
    () => parseSupplierVatPrefill(profile?.supplierVatPrefill),
    [profile?.supplierVatPrefill],
  );

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
  const expenseRows = useQuery(expensesQuery) as readonly ExpenseRow[];

  const expenses = useMemo<readonly DecoratedExpense[]>(
    () =>
      expenseRows.map((expense) => {
        const items = expenseItems(expense.items);
        return {
          ...expense,
          items,
          amounts: expenseAmountsOf(items, expense),
          lineCount: items.length,
          haystack: [
            expense.description,
            expense.expenseNumber,
            expense.supplierName,
            expense.supplierVat,
            /* The breakdown is searchable too — "za co ten náklad byl" now
               often lives on the lines rather than in the description. */
            ...items.map((item) => item.description ?? ""),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      }),
    [expenseRows],
  );

  const templatesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expenseTemplate")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc"),
      ),
    [evolu, owner.id],
  );
  const templates = useQuery(templatesQuery) as readonly ExpenseTemplateRow[];

  const pad = (value: number) => String(value + 1).padStart(2, "0");
  const lastDay = new Date(period.year, period.month + 1, 0).getDate();
  /* The export function below reads these two names, unchanged. */
  const dateFrom = `${period.year}-${pad(period.month)}-01`;
  const dateTo = `${period.year}-${pad(period.month)}-${String(lastDay).padStart(2, "0")}`;

  const inPeriod = (expense: DecoratedExpense) => {
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

  /** Which recurring costs the chosen period already carries. */
  const booked = useMemo(
    () =>
      new Set(
        dateRangeExpenses
          .map((expense) => expense.templateId)
          .filter((id): id is string => Boolean(id)),
      ),
    [dateRangeExpenses],
  );

  const needle = search.trim().toLowerCase();
  const visible = useMemo(() => {
    /* Search stays inside the chosen period unless "vše" is on. Widening it
       silently put rows from other months in the table while the panel above
       kept totalling the period — two different sets, described as one. */
    const base = browseAll ? expenses : dateRangeExpenses;
    if (!needle) return base;
    return base.filter((expense) => expense.haystack.includes(needle));
  }, [browseAll, dateRangeExpenses, expenses, needle]);

  const totals = useMemo(() => {
    let base = 0;
    let gross = 0;
    for (const expense of dateRangeExpenses) {
      gross += expense.amounts.gross;
      base += expense.amounts.net;
    }
    return { base, vat: gross - base, gross, count: dateRangeExpenses.length };
  }, [dateRangeExpenses]);

  const yearTotal = useMemo(
    () =>
      expenses.reduce((sum, expense) => {
        if (!expense.expenseDate) return sum;
        const date = new Date(expense.expenseDate);
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== period.year) {
          return sum;
        }
        return sum + expense.amounts.gross;
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

  /**
   * Books a recurring cost into the period on screen.
   *
   * The template's day of the month is clamped to the period's length, so a
   * cost dated the 31st still lands inside February rather than silently
   * rolling into March.
   */
  const generateFromTemplate = (template: ExpenseTemplateRow): boolean => {
    const stamp = `${template.id}:${period.year}-${period.month}`;
    if (booked.has(template.id) || generated.current.has(stamp)) return false;
    const day = Math.min(
      Math.max(Math.round(Number(template.dayOfMonth ?? 1)) || 1, 1),
      lastDay,
    );
    const iso = `${period.year}-${pad(period.month)}-${String(day).padStart(2, "0")}`;
    const dateResult = Evolu.dateToDateIso(new Date(`${iso}T12:00:00`));
    if (!dateResult.ok) return false;

    const items = expenseItems(template.items);
    const itemsResult =
      items.length > 0 ? Evolu.Json.from(JSON.stringify(items)) : null;

    const result = evolu.insert("expense", {
      description: template.description || template.name || "",
      expenseDate: dateResult.value,
      expenseNumber: null,
      supplierName: template.supplierName,
      supplierVat: template.supplierVat,
      supplierIco: template.supplierIco,
      amountWithoutVat: template.amountWithoutVat,
      vatRate: template.vatRate,
      amountWithVat: template.amountWithVat,
      items: itemsResult?.ok ? itemsResult.value : null,
      note: template.note,
      templateId: template.id,
      deleted: Evolu.sqliteFalse,
    });
    if (result.ok) generated.current.add(stamp);
    return result.ok;
  };

  const runGeneration = (chosen: readonly ExpenseTemplateRow[]) => {
    const done = chosen.filter((template) => generateFromTemplate(template));
    if (done.length === 0) {
      notify(t("expenseTemplates.generateFailed"), "error");
      return;
    }
    notify(
      done.length === 1
        ? t("expenseTemplates.generated", {
            name: done[0].name ?? "",
            period: periodLabel,
          })
        : t("expenseTemplates.generatedMany", {
            count: done.length,
            period: periodLabel,
          }),
    );
  };

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

    /* Purchases carrying no tax give nothing to deduct, so they are not part
       of the statement — including its 10 000 Kč threshold and the supplier
       details that threshold demands. */
    const reportable = dateRangeExpenses.filter(
      (e) => !hasNothingToReport(e),
    );
    const above10k = reportable.filter((e) => e.amounts.gross > 10000);
    const atOrBelow10k = reportable.filter((e) => e.amounts.gross <= 10000);

    const missingInfo = above10k.some(
      (e) => !e.supplierVat?.toString().trim() || !e.expenseNumber?.toString().trim(),
    );
    if (missingInfo) {
      notify(t("expensesList.exportXmlMissingSupplierInfo"), "error");
      return;
    }

    const b2Lines: string[] = [];
    const b2Sums = { zakl_dane1: 0, dan1: 0, zakl_dane2: 0, dan2: 0 };
    for (const e of above10k) {
      /* One document can carry both rates — VetaB2 has attributes for each,
         so an itemised expense is reported per band rather than flattened
         onto whichever rate happens to sit on the document. */
      const bands = expenseVatBands(e);
      if (bandsAreEmpty(bands)) continue;
      const dicDod = stripCzPrefix(e.supplierVat?.toString() ?? "");
      const cEvidDd = escapeXmlAttr(e.expenseNumber?.toString() ?? "");
      const dppd = toDateCz(e.expenseDate ?? "");

      const rateAttrs: string[] = [];
      if (bands.zakl_dane1 !== 0 || bands.dan1 !== 0) {
        rateAttrs.push(`zakl_dane1="${bands.zakl_dane1.toFixed(2)}"`);
        rateAttrs.push(`dan1="${bands.dan1.toFixed(2)}"`);
      }
      if (bands.zakl_dane2 !== 0 || bands.dan2 !== 0) {
        rateAttrs.push(`zakl_dane2="${bands.zakl_dane2.toFixed(2)}"`);
        rateAttrs.push(`dan2="${bands.dan2.toFixed(2)}"`);
      }
      addBands(b2Sums, bands);

      const attrs = [
        /* Numbered by what is emitted, not by position in the list: a
           skipped document must not leave a hole in the numbering. */
        `c_radku="${b2Lines.length + 1}"`,
        `dic_dod="${escapeXmlAttr(dicDod)}"`,
        `c_evid_dd="${cEvidDd}"`,
        `dppd="${dppd}"`,
        ...rateAttrs,
        `pomer="N"`,
        `zdph_44="N"`,
      ].join(" ");
      b2Lines.push(`    <VetaB2 ${attrs} />`);
    }

    const b3Sums = { zakl_dane1: 0, dan1: 0, zakl_dane2: 0, dan2: 0 };
    for (const e of atOrBelow10k) {
      if (e.amounts.gross <= 0) continue;
      addBands(b3Sums, expenseVatBands(e));
    }

    const hasB3 = !bandsAreEmpty(b3Sums);

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

  /** What the row is filed under: who it was from, and for what. */
  const rowSupplier = (expense: DecoratedExpense) =>
    supplierLabel(expense, knownSuppliers);

  /* A document over 10 000 Kč cannot be filed without the supplier's DIČ and
     its own number, and the export refuses the whole period over one missing
     value. The same predicate the export uses, so every row it stops on says
     so — generated recurring costs start without a number, and a supplier's
     DIČ is free text nobody is forced to fill in. */
  const blocksExport = (expense: DecoratedExpense, gross: number) =>
    isVatPayer &&
    gross > 10000 &&
    !hasNothingToReport(expense) &&
    (!expense.supplierVat?.trim() || !expense.expenseNumber?.trim());

  const missingNumber = (expense: DecoratedExpense, gross: number) =>
    blocksExport(expense, gross) && !expense.expenseNumber?.trim();

  const missingVat = (expense: DecoratedExpense, gross: number) =>
    blocksExport(expense, gross) && !expense.supplierVat?.trim();

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

        {/* ---- What repeats every month ------------------------------- */}
        <RecurringPanel
          templates={templates}
          booked={booked}
          periodLabel={periodLabel}
          money={money}
          onGenerate={(template) => runGeneration([template])}
          onGenerateMissing={() =>
            runGeneration(
              templates.filter((template) => !booked.has(template.id)),
            )
          }
          onEdit={onEditTemplate}
          onCreate={onCreateTemplate}
        />

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
                  <th>{t("expensesList.colSupplier")}</th>
                  <th>{t("expensesList.colDescription")}</th>
                  <th>{t("expensesList.colNumber")}</th>
                  {isVatPayer ? (
                    <>
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
                  const { amounts, lineCount } = expense;
                  const needsNumber = missingNumber(expense, amounts.gross);
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
                      <td className="ledger-client">
                        {rowSupplier(expense) || t("common.placeholderDash")}
                        {missingVat(expense, amounts.gross) ? (
                          <span
                            className="ledger-warn ml-2"
                            title={t("expensesList.numberMissingHint")}
                          >
                            {t("expensesList.vatMissing")}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {expense.description}
                        {lineCount > 0 ? (
                          <span className="lstate ml-2">
                            {lineCount} {tp("expensesList.itemCount", lineCount)}
                          </span>
                        ) : null}
                      </td>
                      <td className="ledger-date">
                        {expense.expenseNumber ? (
                          expense.expenseNumber
                        ) : needsNumber ? (
                          <span
                            className="ledger-warn"
                            title={t("expensesList.numberMissingHint")}
                          >
                            {t("expensesList.numberMissing")}
                          </span>
                        ) : (
                          t("common.placeholderDash")
                        )}
                      </td>
                      {isVatPayer ? (
                        <>
                          <td className="ledger-amount">
                            {amount(amounts.net)}
                          </td>
                          <td className="ledger-amount">
                            {amount(amounts.vat)}
                          </td>
                        </>
                      ) : null}
                      <td className="ledger-amount">{amount(amounts.gross)}</td>
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
                const { amounts } = expense;
                const supplier = rowSupplier(expense);
                return (
                  <li key={expense.id} className="lcard" data-status="unpaid">
                    <button
                      type="button"
                      className="lcard-open"
                      onClick={() => onViewDetails(expense.id)}
                    >
                      <span className="lcard-line">
                        <span className="lcard-client">
                          {supplier || expense.description}
                        </span>
                        {/* The table's header carries the currency
                            ("Celkem · CZK") and is hidden here. */}
                        <span className="lcard-amount num">
                          {money(amounts.gross)}
                        </span>
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
                        {missingNumber(expense, amounts.gross) ? (
                          <span className="ledger-warn">
                            {t("expensesList.numberMissing")}
                          </span>
                        ) : null}
                        {missingVat(expense, amounts.gross) ? (
                          <span className="ledger-warn">
                            {t("expensesList.vatMissing")}
                          </span>
                        ) : null}
                        <span className="ledger-date">
                          {supplier ? expense.description : ""}
                        </span>
                      </span>
                      {isVatPayer ? (
                        <span className="lcard-line lcard-meta">
                          <span className="ledger-date">
                            {t("expensesList.colBase")} {amount(amounts.net)}
                          </span>
                          <span className="ledger-date">
                            {t("expensesList.colVat")} {amount(amounts.vat)}
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
