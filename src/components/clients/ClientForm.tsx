import { Search } from "lucide-react";
import { useI18n } from "../../i18n";
import { useAres } from "../../lib/useAres";
import type { ClientFormValues } from "../../lib/clientForm";

type ClientFormProps = {
  values: ClientFormValues;
  onChange: (patch: Partial<ClientFormValues>) => void;
  nameError?: string;
};

/**
 * One client form, used when creating and when editing.
 *
 * The create and detail pages each carried their own copy of these fields, and
 * only the create one had the ARES lookup.
 */
export function ClientForm({ values, onChange, nameError }: ClientFormProps) {
  const { t } = useI18n();
  const ares = useAres(t, (result) =>
    onChange({
      ...(result.name ? { name: result.name } : {}),
      ...(result.vatNumber ? { vatNumber: result.vatNumber } : {}),
      ...(result.addressLine1 ? { addressLine1: result.addressLine1 } : {}),
      ...(result.addressLine2 ? { addressLine2: result.addressLine2 } : {}),
    }),
  );

  return (
    <div className="client-form">
      <section className="compose-block">
        <h2 className="compose-heading">{t("clientsForm.identityTitle")}</h2>

        <label htmlFor="clientCompanyId" className="form-label">
          {t("clientsForm.companyIdLabel")}
        </label>
        {/* IČO first: it fills in everything below it. */}
        <div className="input-affix">
          <input
            id="clientCompanyId"
            type="text"
            inputMode="numeric"
            value={values.companyIdentificationNumber}
            onChange={(e) =>
              onChange({ companyIdentificationNumber: e.target.value })
            }
            className="form-input mono"
          />
          <button
            type="button"
            className="input-affix-btn"
            disabled={ares.isLoading}
            onClick={() => ares.lookup(values.companyIdentificationNumber)}
            title={t("clientsForm.aresLoad")}
            aria-label={t("clientsForm.aresLoad")}
          >
            <Search />
          </button>
        </div>
        <p className="field-hint">
          {ares.isLoading ? t("clientsForm.aresLoading") : t("clientsForm.aresHint")}
        </p>

        <label htmlFor="clientName" className="form-label mt-3">
          {t("clientsForm.nameLabel")}
        </label>
        <input
          id="clientName"
          type="text"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="form-input"
          aria-invalid={Boolean(nameError)}
        />
        {nameError ? <p className="field-error">{nameError}</p> : null}

        <label htmlFor="clientVat" className="form-label mt-3">
          {t("clientsForm.vatLabel")}
        </label>
        <input
          id="clientVat"
          type="text"
          value={values.vatNumber}
          onChange={(e) => onChange({ vatNumber: e.target.value })}
          className="form-input mono"
        />
      </section>

      <section className="compose-block">
        <h2 className="compose-heading">{t("clientsForm.addressTitle")}</h2>
        <label htmlFor="clientAddress1" className="form-label">
          {t("clientsForm.addressLine1Label")}
        </label>
        <input
          id="clientAddress1"
          type="text"
          value={values.addressLine1}
          onChange={(e) => onChange({ addressLine1: e.target.value })}
          className="form-input"
        />
        <label htmlFor="clientAddress2" className="form-label mt-3">
          {t("clientsForm.addressLine2Label")}
        </label>
        <input
          id="clientAddress2"
          type="text"
          value={values.addressLine2}
          onChange={(e) => onChange({ addressLine2: e.target.value })}
          className="form-input"
        />
      </section>

      <section className="compose-block">
        <h2 className="compose-heading">{t("clientsForm.contactTitle")}</h2>
        <div className="doc-pair-even">
          <div>
            <label htmlFor="clientEmail" className="form-label">
              {t("clientsForm.emailLabel")}
            </label>
            <input
              id="clientEmail"
              type="email"
              value={values.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="clientPhone" className="form-label">
              {t("clientsForm.phoneLabel")}
            </label>
            <input
              id="clientPhone"
              type="tel"
              value={values.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              className="form-input"
            />
          </div>
        </div>
        <label htmlFor="clientNote" className="form-label mt-3">
          {t("clientsForm.noteLabel")}
        </label>
        <textarea
          id="clientNote"
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
          className="form-textarea"
          rows={3}
        />
      </section>
    </div>
  );
}
