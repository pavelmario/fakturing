export type BankAccountRow = {
  id: string;
  label: string | null;
  accountNumber: string | null;
  iban: string | null;
  swift: string | null;
  currency: string | null;
  isDefault: number | null;
};

export type ResolvedAccount = {
  id: string | null;
  label: string;
  accountNumber: string;
  iban: string;
  swift: string;
  currency: string;
};

type LegacyProfile = {
  bankAccount?: string | null;
  iban?: string | null;
  swift?: string | null;
} | null;

/**
 * The account an invoice is payable to.
 *
 * Falls back to the single account that used to live on the profile, so
 * existing users keep a working payment QR until they add real accounts.
 */
export const resolveAccount = (
  accounts: readonly BankAccountRow[],
  profile: LegacyProfile,
  bankAccountId?: string | null,
): ResolvedAccount | null => {
  const chosen =
    (bankAccountId && accounts.find((a) => a.id === bankAccountId)) ||
    accounts.find((a) => a.isDefault === 1) ||
    accounts[0];

  if (chosen) {
    return {
      id: chosen.id,
      label: chosen.label ?? "",
      accountNumber: chosen.accountNumber ?? "",
      iban: chosen.iban ?? "",
      swift: chosen.swift ?? "",
      currency: chosen.currency ?? "",
    };
  }

  const legacy = {
    accountNumber: profile?.bankAccount ?? "",
    iban: profile?.iban ?? "",
    swift: profile?.swift ?? "",
  };
  if (!legacy.accountNumber && !legacy.iban && !legacy.swift) return null;
  return { id: null, label: "", currency: "", ...legacy };
};
