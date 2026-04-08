type SupplierVatPrefillOption = {
  name: string;
  vat: string;
};

export const parseSupplierVatPrefill = (
  rawValue: string | null | undefined,
): SupplierVatPrefillOption[] => {
  if (!rawValue) return [];

  const options: SupplierVatPrefillOption[] = [];
  const lines = rawValue.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const separatorIndex = trimmedLine.indexOf("|");
    if (separatorIndex <= 0) continue;

    const vat = trimmedLine.slice(0, separatorIndex).trim();
    const name = trimmedLine.slice(separatorIndex + 1).trim();

    if (!vat || !name) continue;
    options.push({ name, vat });
  }

  return options;
};

export type { SupplierVatPrefillOption };
