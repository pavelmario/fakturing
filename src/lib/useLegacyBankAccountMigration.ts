import { use, useEffect, useMemo, useRef } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

/**
 * Moves the single bank account that used to live on `userProfile` into the
 * `bankAccount` table, once, at app start.
 *
 * The profile's own fields are cleared in the same pass. Leaving them would
 * mean deleting the migrated account silently resurrects it on the next load,
 * because the migration's own guard is "there are no accounts yet".
 */
export const useLegacyBankAccountMigration = () => {
  const { t } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const migrated = useRef(false);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["id", "bankAccount", "iban", "swift"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const accountsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("bankAccount")
          .select(["id"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue),
      ),
    [evolu, owner.id],
  );

  const profile = useQuery(profileQuery)[0] ?? null;
  const accounts = useQuery(accountsQuery);

  useEffect(() => {
    if (migrated.current) return;
    if (!profile || accounts.length > 0) return;

    const accountNumber = profile.bankAccount?.trim() ?? "";
    const iban = profile.iban?.trim() ?? "";
    const swift = profile.swift?.trim() ?? "";
    if (!accountNumber && !iban && !swift) return;

    migrated.current = true;

    const inserted = evolu.insert("bankAccount", {
      label: t("profile.bankLegacyLabel"),
      accountNumber: accountNumber || null,
      iban: iban || null,
      swift: swift || null,
      currency: "CZK",
      isDefault: Evolu.sqliteTrue,
      deleted: Evolu.sqliteFalse,
    });

    if (!inserted.ok) {
      console.error("Legacy bank account migration failed:", inserted.error);
      migrated.current = false;
      return;
    }

    evolu.update("userProfile", {
      id: profile.id,
      bankAccount: null,
      iban: null,
      swift: null,
    });
  }, [accounts.length, evolu, profile, t]);
};
