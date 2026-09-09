import { use, useEffect, useMemo, useRef } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

/**
 * Puts the register entry in the invoice footer, once.
 *
 * § 435 of the civil code has every business document state where its author
 * is registered, and an invoice is one — for a sole trader that is the trade
 * register, which is why nearly every Czech invoice carries the sentence. It
 * is written into the profile rather than printed out of nowhere: a company's
 * wording is different, and a field you can see is a field you can correct.
 *
 * Recorded as done in the same write, so a footer cleared from here on stays
 * cleared instead of growing back on the next load. The upgrade itself is
 * the one pass it cannot tell apart: a footer left empty and a footer emptied
 * on purpose look the same in a profile written before the marker existed,
 * and both get the sentence once.
 */
export const useInvoiceFooterDefault = () => {
  const { t } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const done = useRef(false);
  /* The string, not `t` — `useI18n` builds a fresh one every render, and a
     dependency that always changes runs this effect on every render. */
  const line = t("profile.footerDefault");

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["id", "invoiceFooterText", "footerDefaulted"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const profile = useQuery(profileQuery)[0] ?? null;

  useEffect(() => {
    if (done.current || !profile) return;
    if (profile.footerDefaulted === Evolu.sqliteTrue) return;
    done.current = true;

    /* Anyone who has already worded their own footer just gets the marker —
       theirs is the one that knows which authority they are registered with. */
    const written = profile.invoiceFooterText?.toString().trim();
    const result = evolu.update("userProfile", {
      id: profile.id,
      footerDefaulted: Evolu.sqliteTrue,
      ...(written ? {} : { invoiceFooterText: line }),
    });
    /* Not retried — a second attempt would land in the same tick with the
       same values — but a footer that silently failed to appear is worth
       finding in a console rather than in a client's inbox. */
    if (!result.ok) console.error("Footer default error:", result.error);
  }, [evolu, line, profile]);
};
