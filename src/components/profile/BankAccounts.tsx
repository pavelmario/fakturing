import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { Check, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useEvolu } from "../../evolu";
import { useI18n } from "../../i18n";
import { useConfirm, useNotify } from "../../lib/confirmContext";
import type { BankAccountRow } from "../../lib/bankAccounts";
import { SelectField } from "../invoices/SelectField";
import { CURRENCIES, DEFAULT_CURRENCY, isCurrencyCode } from "../../lib/money";

type Draft = {
  label: string;
  accountNumber: string;
  iban: string;
  swift: string;
  currency: string;
};

const emptyDraft = (): Draft => ({
  label: "",
  accountNumber: "",
  iban: "",
  swift: "",
  currency: "CZK",
});

/**
 * Several bank accounts — typically one per currency.
 *
 * The profile used to hold exactly one, so invoicing a client in EUR meant
 * either editing your profile each time or printing the wrong IBAN.
 */
type BankAccountsProps = {
  /** Follows the page's edit mode — the rest of Profil is read-only until
   *  Upravit, so these controls should be too. */
  editable: boolean;
};

export function BankAccounts({ editable }: BankAccountsProps) {
  const { t } = useI18n();
  const confirmDialog = useConfirm();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const query = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("bankAccount")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("label", "asc"),
      ),
    [evolu, owner.id],
  );
  const accounts = useQuery(query) as readonly BankAccountRow[];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const startAdd = () => {
    setDraft(emptyDraft());
    setEditingId("new");
  };

  const startEdit = (account: BankAccountRow) => {
    setDraft({
      label: account.label ?? "",
      accountNumber: account.accountNumber ?? "",
      iban: account.iban ?? "",
      swift: account.swift ?? "",
      currency: account.currency ?? "",
    });
    setEditingId(account.id);
  };

  const cancel = () => setEditingId(null);

  const patch = (part: Partial<Draft>) =>
    setDraft((prev) => ({ ...prev, ...part }));

  /* A code saved before this was a picker — or one Intl does not know — stays
     in the list, so editing an account cannot silently change its currency. */
  const currencyOptions = useMemo(() => {
    const current = draft.currency.trim().toUpperCase();
    const codes: string[] = [...CURRENCIES];
    if (current && !codes.includes(current)) codes.push(current);
    return codes.map((code) => ({
      value: code,
      label: isCurrencyCode(code) ? code : `${code} — ?`,
    }));
  }, [draft.currency]);

  const save = () => {
    if (!draft.label.trim()) return;
    const toNull = (value: string) => value.trim() || null;
    const payload = {
      label: draft.label.trim(),
      accountNumber: toNull(draft.accountNumber),
      iban: toNull(draft.iban),
      swift: toNull(draft.swift),
      currency: toNull(draft.currency),
    };
    const result =
      editingId === "new"
        ? evolu.insert("bankAccount", {
            ...payload,
            /* The first account added becomes the default. */
            isDefault:
              accounts.length === 0 ? Evolu.sqliteTrue : Evolu.sqliteFalse,
            deleted: Evolu.sqliteFalse,
          })
        : evolu.update("bankAccount", { id: editingId!, ...payload });
    if (!result.ok) {
      console.error("Bank account save error:", result.error);
      notify(t("alerts.settingsSaveFailed"), "error");
      return;
    }
    cancel();
  };

  const makeDefault = (account: BankAccountRow) => {
    for (const other of accounts) {
      evolu.update("bankAccount", {
        id: other.id,
        isDefault:
          other.id === account.id ? Evolu.sqliteTrue : Evolu.sqliteFalse,
      });
    }
  };

  const remove = async (account: BankAccountRow) => {
    const ok = await confirmDialog({
      title: t("profile.bankDeleteConfirm"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    evolu.update("bankAccount", { id: account.id, deleted: Evolu.sqliteTrue });
  };

  const editor = (
    <div className="bank-editor">
      <div className="doc-pair-even">
        <div>
          <label className="form-label">{t("profile.bankLabelLabel")}</label>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => patch({ label: e.target.value })}
            placeholder={t("profile.bankLabelPlaceholder")}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">{t("profile.bankCurrencyLabel")}</label>
          {/* A picker, not free text: this value becomes the invoice's
              currency and is handed to Intl, which rejects anything that is
              not an ISO 4217 code. A code already stored stays selectable. */}
          <SelectField
            value={draft.currency || DEFAULT_CURRENCY}
            options={currencyOptions}
            onChange={(next) => patch({ currency: next })}
            ariaLabel={t("profile.bankCurrencyLabel")}
          />
        </div>
      </div>
      <label className="form-label mt-3">
        {t("settings.bankAccountLabel")}
      </label>
      <input
        type="text"
        value={draft.accountNumber}
        onChange={(e) => patch({ accountNumber: e.target.value })}
        className="form-input mono"
      />
      <div className="doc-pair-even mt-3">
        <div>
          <label className="form-label">{t("settings.ibanLabel")}</label>
          <input
            type="text"
            value={draft.iban}
            onChange={(e) => patch({ iban: e.target.value })}
            className="form-input mono"
          />
        </div>
        <div>
          <label className="form-label">{t("settings.swiftLabel")}</label>
          <input
            type="text"
            value={draft.swift}
            onChange={(e) => patch({ swift: e.target.value })}
            className="form-input mono"
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          className="btn-primary"
          onClick={save}
          disabled={!draft.label.trim()}
        >
          <Check />
          {t("common.save")}
        </button>
        <button className="btn-ghost" onClick={cancel}>
          <X />
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );

  return (
    <section className="compose-block">
      <div className="compose-block-head">
        <h2 className="compose-heading">{t("profile.bankTitle")}</h2>
        {editable && editingId === null ? (
          <button className="btn-secondary" onClick={startAdd}>
            <Plus />
            {t("profile.bankAdd")}
          </button>
        ) : null}
      </div>

      {accounts.length === 0 && editingId === null ? (
        <p className="field-hint">{t("profile.bankEmpty")}</p>
      ) : null}

      {accounts.map((account) =>
        editable && editingId === account.id ? (
          <div key={account.id}>{editor}</div>
        ) : (
          <div key={account.id} className="bank-row">
            <div className="bank-main">
              <span className="bank-label">
                {account.label}
                {account.isDefault === 1 ? (
                  <span className="bank-default">
                    <Star />
                    {t("profile.bankDefault")}
                  </span>
                ) : null}
              </span>
              <span className="bank-numbers mono">
                {[account.accountNumber, account.iban, account.swift]
                  .filter(Boolean)
                  .join(" · ") || t("common.placeholderDash")}
              </span>
            </div>
            <span className="bank-currency mono">{account.currency}</span>
            {editable ? (
            <div className="bank-actions">
              {account.isDefault !== 1 ? (
                <button
                  className="ledger-action"
                  style={{ opacity: 1 }}
                  onClick={() => makeDefault(account)}
                  title={t("profile.bankMakeDefault")}
                  aria-label={t("profile.bankMakeDefault")}
                >
                  <Star />
                </button>
              ) : null}
              <button
                className="ledger-action"
                style={{ opacity: 1 }}
                onClick={() => startEdit(account)}
                title={t("common.edit")}
                aria-label={t("common.edit")}
              >
                <Pencil />
              </button>
              <button
                className="ledger-action"
                style={{ opacity: 1 }}
                onClick={() => remove(account)}
                title={t("common.delete")}
                aria-label={t("common.delete")}
              >
                <Trash2 />
              </button>
            </div>
            ) : null}
          </div>
        ),
      )}

      {editable && editingId === "new" ? editor : null}
    </section>
  );
}
