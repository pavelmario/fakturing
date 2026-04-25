import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

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

const formatDate = (
  iso: string | null,
  locale: string,
  placeholder: string,
): string => {
  if (!iso) return placeholder;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(locale);
};

const formatAmount = (value: number | null, locale: string): string => {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatTotal = (
  value: number,
  locale: string,
  fallback: string,
): string => {
  if (!Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
  const { t, locale } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const resetDateFilters = () => {
    setDateFrom("");
    setDateTo("");
  };

  const expensesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expense")
          .select([
            "id",
            "amountWithoutVat",
            "amountWithVat",
            "vatRate",
            "supplierVat",
            "expenseNumber",
            "description",
            "expenseDate",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("expenseDate", "desc"),
      ),
    [evolu, owner.id],
  );

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

  const expenses = useQuery(expensesQuery) as readonly ExpenseRow[];
  const profileRows = useQuery(profileQuery);
  const profile = profileRows[0] ?? null;

  const normalizedSearch = search.trim().toLowerCase();

  const toDateOnly = (value: string | null): string | null => {
    if (!value) return null;
    return value.includes("T") ? value.slice(0, 10) : value;
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const expenseDateOnly = toDateOnly(expense.expenseDate);

      if (dateFrom && (!expenseDateOnly || expenseDateOnly < dateFrom)) {
        return false;
      }

      if (dateTo && (!expenseDateOnly || expenseDateOnly > dateTo)) {
        return false;
      }

      if (!normalizedSearch) return true;

      const description = expense.description ?? "";
      return description.toLowerCase().includes(normalizedSearch);
    });
  }, [dateFrom, dateTo, expenses, normalizedSearch]);

  const dateRangeExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const expenseDateOnly = toDateOnly(expense.expenseDate);

      if (dateFrom && (!expenseDateOnly || expenseDateOnly < dateFrom)) {
        return false;
      }

      if (dateTo && (!expenseDateOnly || expenseDateOnly > dateTo)) {
        return false;
      }

      return true;
    });
  }, [dateFrom, dateTo, expenses]);

  const monthStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return expenses.reduce(
      (acc, expense) => {
        if (!expense.expenseDate) return acc;

        const parsedDate = new Date(expense.expenseDate);
        if (Number.isNaN(parsedDate.getTime())) return acc;
        if (
          parsedDate.getFullYear() !== currentYear ||
          parsedDate.getMonth() !== currentMonth
        ) {
          return acc;
        }

        acc.count += 1;
        const amountWithVat = Number(expense.amountWithVat ?? 0);
        if (Number.isFinite(amountWithVat)) {
          acc.total += amountWithVat;
        }

        return acc;
      },
      { count: 0, total: 0 },
    );
  }, [expenses]);

  const lastMonthStats = useMemo(() => {
    const now = new Date();
    const reference = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = reference.getFullYear();
    const lastMonth = reference.getMonth();

    return expenses.reduce(
      (acc, expense) => {
        if (!expense.expenseDate) return acc;

        const parsedDate = new Date(expense.expenseDate);
        if (Number.isNaN(parsedDate.getTime())) return acc;
        if (
          parsedDate.getFullYear() !== lastMonthYear ||
          parsedDate.getMonth() !== lastMonth
        ) {
          return acc;
        }

        acc.count += 1;
        const amountWithVat = Number(expense.amountWithVat ?? 0);
        if (Number.isFinite(amountWithVat)) {
          acc.total += amountWithVat;
        }

        return acc;
      },
      { count: 0, total: 0 },
    );
  }, [expenses]);

  const yearStats = useMemo(() => {
    const currentYear = new Date().getFullYear();

    return expenses.reduce(
      (acc, expense) => {
        if (!expense.expenseDate) return acc;

        const parsedDate = new Date(expense.expenseDate);
        if (Number.isNaN(parsedDate.getTime())) return acc;
        if (parsedDate.getFullYear() !== currentYear) return acc;

        acc.count += 1;
        const amountWithVat = Number(expense.amountWithVat ?? 0);
        if (Number.isFinite(amountWithVat)) {
          acc.total += amountWithVat;
        }

        return acc;
      },
      { count: 0, total: 0 },
    );
  }, [expenses]);

  const handleExportKontrolniHlaseni = () => {
    if (!dateFrom || !dateTo) {
      alert(t("expensesList.exportXmlMissingDates"));
      return;
    }

    const vatNumber = profile?.vatNumber?.toString().trim() ?? "";
    if (!vatNumber) {
      alert(t("expensesList.exportXmlMissingVat"));
      return;
    }

    const taxOfficeCode = profile?.taxOfficeCode?.toString().trim() ?? "";
    if (!taxOfficeCode) {
      alert(t("expensesList.exportXmlMissingTaxOffice"));
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
      alert(t("expensesList.exportXmlMissingSupplierInfo"));
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
        <div className="page-card-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <p className="section-title">{t("expensesList.sectionTitle")}</p>
              <h1 className="page-title">{t("expensesList.title")}</h1>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleExportKontrolniHlaseni}
                className="btn-secondary w-full sm:w-auto"
              >
                {t("expensesList.exportXml")}
              </button>
              <button
                onClick={onCreateExpense}
                className="btn-primary w-full sm:w-auto"
              >
                {t("expensesList.create")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="stat-card">
              <div className="section-title">{t("expensesList.statMonth")}</div>
              <div className="mt-2 text-lg font-semibold stat-count">
                {formatTotal(
                  monthStats.total,
                  locale,
                  t("expensesList.currencyFallback"),
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-title">
                {t("expensesList.statLastMonth")}
              </div>
              <div className="mt-2 text-lg font-semibold stat-count">
                {formatTotal(
                  lastMonthStats.total,
                  locale,
                  t("expensesList.currencyFallback"),
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-title">{t("expensesList.statYear")}</div>
              <div className="mt-2 text-lg font-semibold stat-count">
                {formatTotal(
                  yearStats.total,
                  locale,
                  t("expensesList.currencyFallback"),
                )}
              </div>
            </div>
          </div>

          <details className="panel-card mb-6">
            <summary className="cursor-pointer text-sm font-semibold filters-summary">
              {t("expensesList.filters")} 🔎
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="expenseSearch" className="form-label">
                  {t("expensesList.searchLabel")}
                </label>
                <input
                  id="expenseSearch"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("expensesList.searchPlaceholder")}
                  className="form-input"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="expenseDateFrom" className="form-label">
                    {t("expensesList.dateFromLabel")}
                  </label>
                  <input
                    id="expenseDateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="form-input"
                  />
                </div>

                <div>
                  <label htmlFor="expenseDateTo" className="form-label">
                    {t("expensesList.dateToLabel")}
                  </label>
                  <input
                    id="expenseDateTo"
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="form-input"
                  />
                </div>

                <div>
                  <div
                    className="hidden md:block form-label invisible"
                    aria-hidden="true"
                  >
                    {t("expensesList.dateToLabel")}
                  </div>
                  <button
                    type="button"
                    onClick={resetDateFilters}
                    disabled={!dateFrom && !dateTo}
                    className="mt-3 w-full text-left text-sm font-medium text-blue-600 underline underline-offset-2 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                  >
                    {t("expensesList.resetDateFilters")}
                  </button>
                </div>
              </div>
            </div>
          </details>

          {filteredExpenses.length === 0 ? (
            <div className="empty-state">
              {expenses.length === 0
                ? t("expensesList.emptyNone")
                : t("expensesList.emptyNoMatch")}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="list-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <div className="text-sm invoice-row-date mb-1">
                      {formatDate(
                        expense.expenseDate,
                        locale,
                        t("common.placeholderDash"),
                      )}
                    </div>
                    <div className="text-lg font-semibold invoice-row-number">
                      {expense.description ?? t("expensesList.unknownType")}
                    </div>
                    <div className="text-sm font-semibold invoice-row-amount">
                      {formatAmount(expense.amountWithVat, locale)}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2">
                    <button
                      onClick={() => onViewDetails(expense.id)}
                      className="btn-secondary w-full sm:w-auto"
                    >
                      {t("expensesList.detail")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
