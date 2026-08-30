import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { Pencil, Search } from "lucide-react";
import { BankAccounts } from "./profile/BankAccounts";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { useAres } from "../lib/useAres";

type ProfilePageProps = {
  onSaved: () => void;
};

type Values = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  companyIdentificationNumber: string;
  vatPayer: boolean;
  vatNumber: string;
  taxOfficeCode: string;
  taxOfficeWorkplaceCode: string;
  bankAccount: string;
  iban: string;
  swift: string;
  invoiceFooterText: string;
};

const empty = (): Values => ({
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  companyIdentificationNumber: "",
  vatPayer: false,
  vatNumber: "",
  taxOfficeCode: "",
  taxOfficeWorkplaceCode: "",
  bankAccount: "",
  iban: "",
  swift: "",
  invoiceFooterText: "",
});

/**
 * Your business identity — everything that prints on an invoice.
 *
 * Lived inside a 1966-line Settings page mixed with relay URLs, the backup
 * seed and CSV import, so the details every document is built from sat beside
 * app plumbing. Settings keeps only configuration; this owns the profile row
 * and is the only page that creates it, since `name` is required.
 */
export function ProfilePage({ onSaved }: ProfilePageProps) {
  const { t } = useI18n();
  const confirmDialog = useConfirm();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

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

  /* Derived from the stored row rather than synced into state by an effect:
     `draft` is null until you touch something, so a profile arriving a tick
     later cannot overwrite what you are typing. */
  const stored = useMemo<Values>(
    () =>
      profile
        ? {
            name: profile.name ?? "",
            email: profile.email ?? "",
            phone: profile.phone ?? "",
            addressLine1: profile.addressLine1 ?? "",
            addressLine2: profile.addressLine2 ?? "",
            companyIdentificationNumber:
              profile.companyIdentificationNumber ?? "",
            vatPayer: profile.vatPayer === Evolu.sqliteTrue,
            vatNumber: profile.vatNumber ?? "",
            taxOfficeCode: profile.taxOfficeCode ?? "",
            taxOfficeWorkplaceCode: profile.taxOfficeWorkplaceCode ?? "",
            bankAccount: profile.bankAccount ?? "",
            iban: profile.iban ?? "",
            swift: profile.swift ?? "",
            invoiceFooterText: profile.invoiceFooterText ?? "",
          }
        : empty(),
    [profile],
  );

  const [draft, setDraft] = useState<Values | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);

  const values = draft ?? stored;
  /* Compared against the stored row, not merely "has a draft" — editing a
     field and putting it back should stop claiming unsaved changes. */
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(stored);

  const set = (patch: Partial<Values>) => {
    setNameError(undefined);
    setDraft((prev) => ({ ...(prev ?? stored), ...patch }));
  };

  /* The register knows your own details too, not just your clients'. */
  const ares = useAres(t, (result) =>
    set({
      ...(result.name ? { name: result.name } : {}),
      ...(result.vatNumber ? { vatNumber: result.vatNumber } : {}),
      ...(result.addressLine1 ? { addressLine1: result.addressLine1 } : {}),
      ...(result.addressLine2 ? { addressLine2: result.addressLine2 } : {}),
    }),
  );

  const handleSave = (): boolean => {
    if (!values.name.trim()) {
      setNameError(t("alerts.nameRequired"));
      return false;
    }
    const toNull = (value: string) => value.trim() || null;
    const payload = {
      name: values.name.trim(),
      email: toNull(values.email),
      phone: toNull(values.phone),
      addressLine1: toNull(values.addressLine1),
      addressLine2: toNull(values.addressLine2),
      companyIdentificationNumber: toNull(values.companyIdentificationNumber),
      vatPayer: values.vatPayer ? Evolu.sqliteTrue : Evolu.sqliteFalse,
      vatNumber: toNull(values.vatNumber),
      taxOfficeCode: toNull(values.taxOfficeCode),
      taxOfficeWorkplaceCode: toNull(values.taxOfficeWorkplaceCode),
      bankAccount: toNull(values.bankAccount),
      iban: toNull(values.iban),
      swift: toNull(values.swift),
      invoiceFooterText: toNull(values.invoiceFooterText),
    };

    setIsSaving(true);
    const result = profile?.id
      ? evolu.update("userProfile", { id: profile.id, ...payload })
      : evolu.insert("userProfile", payload);
    setIsSaving(false);

    if (!result.ok) {
      const formatTypeError = Evolu.createFormatTypeError();
      console.error("Profile save error:", result.error);
      notify(
        t("alerts.settingsValidationError", {
          details: formatTypeError(result.error),
        }), "error");
      return false;
    }
    setDraft(null);
    onSaved();
    return true;
  };

  const cancelEditing = async () => {
    if (dirty && !(await confirmDialog({
      title: t("invoiceDetail.discardConfirm"),
      confirmLabel: t("invoiceDetail.cancelEdits"),
      tone: "danger",
    }))) {
      return;
    }
    setDraft(null);
    setNameError(undefined);
    setIsEditing(false);
  };

  const save = () => {
    if (handleSave()) setIsEditing(false);
  };

  const field = (
    id: keyof Values,
    label: string,
    extra?: { mono?: boolean; type?: string },
  ) => (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input
        id={id}
        type={extra?.type ?? "text"}
        value={values[id] as string}
        onChange={(e) => set({ [id]: e.target.value } as Partial<Values>)}
        className={`form-input${extra?.mono ? " mono" : ""}`}
      />
    </div>
  );

  /** A label/value pair in the read view; empty values read as a dash. */
  const row = (label: string, value: string, mono = false) => (
    <div className="prow">
      <span className="prow-label">{label}</span>
      <span className={`prow-value${mono ? " mono" : ""}`}>
        {value || t("common.placeholderDash")}
      </span>
    </div>
  );

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="inv-head">
          <div className="inv-ident">
            <div className="client-title">
              {stored.name || t("profile.noName")}
            </div>
            <div className="client-ids mono">
              {stored.companyIdentificationNumber
                ? `${t("clientsForm.companyIdLabel")} ${stored.companyIdentificationNumber}`
                : null}
              {stored.vatNumber
                ? `${stored.companyIdentificationNumber ? " · " : ""}${t("settings.vatLabel")} ${stored.vatNumber}`
                : null}
            </div>
            <div className="inv-dates">
              {stored.vatPayer
                ? t("profile.isVatPayer")
                : t("profile.isNotVatPayer")}
            </div>
          </div>
        </div>

        <div className="inv-actions">
          {!isEditing ? (
            <button
              className="btn-primary"
              onClick={() => {
                setDraft(stored);
                setIsEditing(true);
              }}
            >
              <Pencil />
              {t("common.edit")}
            </button>
          ) : null}
        </div>

        {isEditing ? (
          <>
            <div className="editing-bar settings-bar">
              <span>{t("profile.editingBanner")}</span>
              <div className="editing-bar-actions">
                <button className="btn-ghost" onClick={cancelEditing}>
                  {t("invoiceDetail.cancelEdits")}
                </button>
                <button
                  className="btn-primary"
                  onClick={save}
                  disabled={isSaving}
                >
                  {isSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>

            <div className="client-form">
              <section className="compose-block">
                <h2 className="compose-heading">
                  {t("profile.identityTitle")}
                </h2>
                <p className="settings-help-text mb-2">
                  {t("profile.identityHint")}
                </p>

                <label htmlFor="profileIco" className="form-label">
                  {t("clientsForm.companyIdLabel")}
                </label>
                <div className="input-affix">
                  <input
                    id="profileIco"
                    type="text"
                    inputMode="numeric"
                    value={values.companyIdentificationNumber}
                    onChange={(e) =>
                      set({ companyIdentificationNumber: e.target.value })
                    }
                    className="form-input mono"
                  />
                  <button
                    type="button"
                    className="input-affix-btn"
                    disabled={ares.isLoading}
                    onClick={() =>
                      ares.lookup(values.companyIdentificationNumber)
                    }
                    title={t("clientsForm.aresLoad")}
                    aria-label={t("clientsForm.aresLoad")}
                  >
                    <Search />
                  </button>
                </div>
                <p className="field-hint">
                  {ares.isLoading
                    ? t("clientsForm.aresLoading")
                    : t("profile.aresHint")}
                </p>

                <label htmlFor="name" className="form-label mt-3">
                  {t("settings.nameLabel")}
                </label>
                <input
                  id="name"
                  type="text"
                  value={values.name}
                  onChange={(e) => set({ name: e.target.value })}
                  className="form-input"
                  aria-invalid={Boolean(nameError)}
                />
                {nameError ? <p className="field-error">{nameError}</p> : null}

                <label className="setting-toggle mt-3">
                  <input
                    type="checkbox"
                    checked={values.vatPayer}
                    onChange={(e) => set({ vatPayer: e.target.checked })}
                  />
                  <span>{t("settings.vatPayerLabel")}</span>
                </label>

                {values.vatPayer ? (
                  <>
                    <label htmlFor="vatNumber" className="form-label mt-3">
                      {t("settings.vatLabel")}
                    </label>
                    <input
                      id="vatNumber"
                      type="text"
                      value={values.vatNumber}
                      onChange={(e) => set({ vatNumber: e.target.value })}
                      className="form-input mono"
                    />
                    <div className="doc-pair-even mt-3">
                      {field("taxOfficeCode", t("settings.taxOfficeCodeLabel"), {
                        mono: true,
                      })}
                      {field(
                        "taxOfficeWorkplaceCode",
                        t("settings.taxOfficeWorkplaceCodeLabel"),
                        { mono: true },
                      )}
                    </div>
                    <p className="field-hint">{t("profile.taxOfficeHint")}</p>
                  </>
                ) : null}
              </section>

              <section className="compose-block">
                <h2 className="compose-heading">
                  {t("settings.addressTitle")}
                </h2>
                {field("addressLine1", t("settings.addressLine1Label"))}
                <div className="mt-3">
                  {field("addressLine2", t("settings.addressLine2Label"))}
                </div>
              </section>

              <section className="compose-block">
                <h2 className="compose-heading">
                  {t("settings.contactTitle")}
                </h2>
                <div className="doc-pair-even">
                  {field("email", t("settings.emailLabel"), { type: "email" })}
                  {field("phone", t("settings.phoneLabel"), { type: "tel" })}
                </div>
              </section>

              <BankAccounts editable />

              <section className="compose-block">
                <h2 className="compose-heading">{t("settings.footerTitle")}</h2>
                <textarea
                  id="invoiceFooterText"
                  value={values.invoiceFooterText}
                  onChange={(e) => set({ invoiceFooterText: e.target.value })}
                  placeholder={t("settings.footerPlaceholder")}
                  className="form-textarea"
                  rows={3}
                />
                <p className="field-hint">{t("profile.footerHint")}</p>
              </section>
            </div>
          </>
        ) : (
          /* Read view: this is a reference card, not a form. */
          <div className="client-form">
            <section className="compose-block">
              <h2 className="compose-heading">{t("settings.addressTitle")}</h2>
              {row(t("settings.addressLine1Label"), stored.addressLine1)}
              {row(t("settings.addressLine2Label"), stored.addressLine2)}
            </section>

            <section className="compose-block">
              <h2 className="compose-heading">{t("settings.contactTitle")}</h2>
              {row(t("settings.emailLabel"), stored.email)}
              {row(t("settings.phoneLabel"), stored.phone)}
            </section>

            <BankAccounts editable={false} />

            {stored.vatPayer ? (
              <section className="compose-block">
                <h2 className="compose-heading">{t("profile.taxOffice")}</h2>
                {row(t("settings.taxOfficeCodeLabel"), stored.taxOfficeCode)}
                {row(
                  t("settings.taxOfficeWorkplaceCodeLabel"),
                  stored.taxOfficeWorkplaceCode,
                )}
              </section>
            ) : null}

            <section className="compose-block">
              <h2 className="compose-heading">{t("settings.footerTitle")}</h2>
              <p className="prow-value">
                {stored.invoiceFooterText || t("common.placeholderDash")}
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
