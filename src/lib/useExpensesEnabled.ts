import { use, useMemo } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";

/**
 * Whether cost tracking is on.
 *
 * Expense tracking exists for the VAT machinery, so being a VAT payer turns
 * it on; it stays an explicit toggle for anyone who wants it regardless.
 * The nav and the routes have to answer this the same way, so they ask the
 * same hook.
 */
export const useExpensesEnabled = (): boolean => {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const query = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["expenses", "vatPayer"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const profile = useQuery(query)[0] ?? null;
  return profile?.expenses == null
    ? profile?.vatPayer === Evolu.sqliteTrue
    : profile.expenses === Evolu.sqliteTrue;
};
