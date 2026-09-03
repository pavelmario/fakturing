import type { SupplierVatPrefillOption } from "../supplierVatPrefill";

/**
 * Who you buy from, gathered rather than managed.
 *
 * There is no supplier directory: a supplier is whoever you typed on an
 * earlier expense, plus the DIČ list from Settings. Every expense keeps its
 * own snapshot — the same rule invoices follow for `clientName` — so a
 * supplier can be renamed on the next document without rewriting history.
 */
export type SupplierOption = {
  name: string;
  vat: string;
  ico: string;
};

type SupplierSource = {
  supplierName?: string | null;
  supplierVat?: string | null;
  supplierIco?: string | null;
};

const key = (option: SupplierOption): string =>
  option.name ? `n:${option.name.toLowerCase()}` : `v:${option.vat.toLowerCase()}`;

/**
 * Rows first (they carry the IČO and the spelling actually used), then the
 * Settings list. Merged field by field, so a name typed once and a DIČ
 * configured elsewhere end up as one entry rather than two half-empty ones.
 */
export const collectSuppliers = (
  rows: readonly SupplierSource[],
  prefill: readonly SupplierVatPrefillOption[] = [],
): SupplierOption[] => {
  const merged = new Map<string, SupplierOption>();

  const add = (candidate: SupplierOption) => {
    if (!candidate.name && !candidate.vat) return;
    const id = key(candidate);
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, candidate);
      return;
    }
    merged.set(id, {
      name: existing.name || candidate.name,
      vat: existing.vat || candidate.vat,
      ico: existing.ico || candidate.ico,
    });
  };

  for (const row of rows) {
    add({
      name: row.supplierName?.trim() ?? "",
      vat: row.supplierVat?.trim() ?? "",
      ico: row.supplierIco?.trim() ?? "",
    });
  }
  for (const option of prefill) {
    add({ name: option.name.trim(), vat: option.vat.trim(), ico: "" });
  }

  /* A DIČ-only entry from an expense recorded before there was a name field
     is dropped once the Settings list names that same number. */
  const named = new Map<string, SupplierOption>();
  for (const option of merged.values()) {
    if (option.name) named.set(option.vat.toLowerCase(), option);
  }
  return [...merged.values()]
    .filter((option) => option.name || !named.has(option.vat.toLowerCase()))
    .sort((a, b) =>
      (a.name || a.vat).localeCompare(b.name || b.vat, "cs", {
        sensitivity: "base",
      }),
    );
};

export const findSupplier = (
  suppliers: readonly SupplierOption[],
  name: string,
): SupplierOption | null => {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return (
    suppliers.find((option) => option.name.toLowerCase() === needle) ?? null
  );
};
