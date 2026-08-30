import type { ReactNode } from "react";
import { AlertTriangle, Bitcoin, Check, ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n";
import type { InvoiceForm } from "../../lib/useInvoiceForm";
import { emptyItem } from "../../lib/invoiceItemForm";
import { useTrezorAddress } from "../../lib/useTrezorAddress";
import { DateField } from "./DateField";
import { SelectField } from "./SelectField";
import { NumberField } from "./NumberField";
import { TrezorMark } from "./TrezorMark";
import { InvoiceItemsTable } from "./InvoiceItemsTable";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  supportsCzechQr,
} from "../../lib/money";

type ClientOption = { id: string; name: string | null };

type InvoiceComposerProps = {
  form: InvoiceForm;
  clients: readonly ClientOption[];
  isVatPayer: boolean;
  isPoRequired: boolean;
  /** Default unit and VAT rate for a newly added line. */
  lineDefaults: { unit: string; vat: string };
  duplicateNumber?: boolean;
  bankAccounts: readonly { id: string; label: string; currency: string }[];
  formatAmount: (value: number) => string;
  /** Page-specific content under the client field (e.g. "use as template"). */
  clientSlot?: ReactNode;
  /** Page-specific footer in the sidebar (totals + primary action). */
  sidebarFooter: ReactNode;
  noteOpen: boolean;
  onNoteOpenChange: (open: boolean) => void;
};

/**
 * The invoice form itself: what you type on the left, what mostly fills itself
 * in on the right. Rendered identically when creating and when editing, so the
 * two cannot drift apart.
 */
export function InvoiceComposer({
  form,
  clients,
  isVatPayer,
  isPoRequired,
  lineDefaults,
  duplicateNumber = false,
  bankAccounts,
  formatAmount,
  clientSlot,
  sidebarFooter,
  noteOpen,
  onNoteOpenChange,
}: InvoiceComposerProps) {
  const { t } = useI18n();
  /* Reads the effective values — what will actually be saved — so the fields
     cannot show one thing while the summary and the record hold another. */
  const { effective: values, set, errors } = form;
  const trezor = useTrezorAddress(t, (address) => set("btcAddress", address));

  const freshItem = () => ({
    ...emptyItem(),
    unit: lineDefaults.unit,
    vat: lineDefaults.vat,
  });

  const field = (key: keyof typeof errors) =>
    errors[key] ? <p className="field-error">{errors[key]}</p> : null;

  return (
    <div className="compose">
      <div className="compose-main">
        <section className="compose-block">
          <h2 className="compose-heading">{t("invoiceCreate.clientLabel")}</h2>
          <SelectField
            id="clientName"
            value={values.clientName}
            placeholder={t("invoiceCreate.clientPlaceholder")}
            invalid={Boolean(errors.clientName)}
            ariaLabel={t("invoiceCreate.clientLabel")}
            options={clients.map((client) => ({
              value: client.name ?? "",
              label: client.name ?? t("invoiceCreate.clientUnnamed"),
              disabled: !client.name,
            }))}
            onChange={(next) => {
              set("clientName", next);
              /* Store the record too, so renaming the client later does not
                 detach this invoice from them. */
              const picked = clients.find((client) => client.name === next);
              set("clientId", picked?.id ?? "");
            }}
          />
          {field("clientName")}
          {clients.length === 0 ? (
            <p className="settings-help-text mt-2">
              {t("invoiceCreate.clientsEmpty")}
            </p>
          ) : null}
          {clientSlot}
        </section>

        <section className="compose-block">
          <div className="compose-block-head">
            <h2 className="compose-heading">{t("invoiceCreate.itemsTitle")}</h2>
            <button
              type="button"
              className="fchip"
              data-on={form.perUnit}
              aria-pressed={form.perUnit}
              onClick={() => form.setPerUnit(!form.perUnit)}
              title={t("invoiceCreate.perUnitHint")}
            >
              {form.perUnit ? <Check /> : <span className="fchip-dot" />}
              {t("invoiceCreate.perUnit")}
            </button>
          </div>
          <InvoiceItemsTable
            items={values.items}
            isVatPayer={isVatPayer}
            showQuantity={form.perUnit}
            onChange={form.setItem}
            onAdd={() => set("items", [...values.items, freshItem()])}
            onRemove={(index) =>
              set(
                "items",
                values.items.length === 1
                  ? [freshItem()]
                  : values.items.filter((_, i) => i !== index),
              )
            }
            formatAmount={formatAmount}
          />
        </section>

        <section className="compose-block compose-block-tight">
          <button
            type="button"
            className="disclosure"
            aria-expanded={noteOpen}
            onClick={() => onNoteOpenChange(!noteOpen)}
          >
            <ChevronRight />
            <span className="compose-heading">
              {t("invoiceCreate.invoicingNoteLabel")}
            </span>
            {!noteOpen && values.invoicingNote.trim() ? (
              <span className="disclosure-preview">{values.invoicingNote}</span>
            ) : null}
          </button>
          {noteOpen ? (
            <textarea
              id="invoicingNote"
              value={values.invoicingNote}
              onChange={(e) => set("invoicingNote", e.target.value)}
              placeholder={t("invoiceCreate.invoicingNotePlaceholder")}
              className="form-textarea mt-2"
              rows={3}
            />
          ) : null}
        </section>
      </div>

      <aside className="compose-side">
        <div className="compose-panel">
          <h2 className="compose-heading">
            {t("invoiceCreate.documentTitle")}
          </h2>

          <label htmlFor="invoiceNumber" className="form-label">
            {t("invoiceCreate.invoiceNumberLabel")}
          </label>
          <input
            id="invoiceNumber"
            type="text"
            value={values.invoiceNumber}
            onChange={(e) => set("invoiceNumber", e.target.value)}
            className="form-input mono"
            aria-invalid={Boolean(errors.invoiceNumber)}
          />
          {field("invoiceNumber")}
          {duplicateNumber ? (
            <p className="field-warning">
              <AlertTriangle />
              {t("invoiceCreate.duplicateWarning")}
            </p>
          ) : null}

          <div className="doc-pair">
            <div>
              <label htmlFor="issueDate" className="form-label">
                {t("invoiceCreate.issueDateLabel")}
              </label>
              <DateField
                id="issueDate"
                value={values.issueDate}
                invalid={Boolean(errors.issueDate)}
                ariaLabel={t("invoiceCreate.issueDateLabel")}
                onChange={(next) => set("issueDate", next)}
              />
            </div>
            <div>
              <label htmlFor="paymentDays" className="form-label">
                {t("invoiceCreate.paymentDaysLabel")}
              </label>
              <NumberField
                id="paymentDays"
                value={values.paymentDays}
                invalid={Boolean(errors.paymentDays)}
                ariaLabel={t("invoiceCreate.paymentDaysLabel")}
                onChange={(next) => set("paymentDays", next)}
              />
            </div>
          </div>
          {field("issueDate")}
          {field("paymentDays")}
          {form.dueDateLabel ? (
            <p className="field-hint">
              {t("invoiceCreate.dueOn", { date: form.dueDateLabel })}
            </p>
          ) : null}

          <label htmlFor="paymentMethod" className="form-label mt-3">
            {t("invoiceCreate.paymentMethodLabel")}
          </label>
          <div className="pay-row">
            <SelectField
              id="paymentMethod"
              value={values.paymentMethod}
              ariaLabel={t("invoiceCreate.paymentMethodLabel")}
              options={[
                { value: "bank", label: t("invoiceCreate.paymentMethodBank") },
                { value: "cash", label: t("invoiceCreate.paymentMethodCash") },
              ]}
              onChange={(next) => set("paymentMethod", next)}
            />
            <button
              type="button"
              className="btc-switch"
              data-on={values.btcInvoice}
              aria-pressed={values.btcInvoice}
              onClick={() => set("btcInvoice", !values.btcInvoice)}
              title={t("invoiceCreate.btcInvoiceLabel")}
              aria-label={t("invoiceCreate.btcInvoiceLabel")}
            >
              <Bitcoin />
            </button>
          </div>

          {values.btcInvoice ? (
            <div className="input-affix mt-2">
              <input
                id="btcAddress"
                type="text"
                value={values.btcAddress}
                onChange={(e) => set("btcAddress", e.target.value)}
                placeholder={t("invoiceCreate.btcAddressPlaceholder")}
                className="form-input mono"
                aria-label={t("invoiceCreate.btcAddressLabel")}
              />
              <button
                type="button"
                className="input-affix-btn"
                onClick={trezor.load}
                disabled={trezor.isLoading}
                title={t("invoiceCreate.trezorLoad")}
                aria-label={t("invoiceCreate.trezorLoad")}
              >
                <TrezorMark />
              </button>
            </div>
          ) : null}

          <label htmlFor="currency" className="form-label mt-3">
            {t("invoiceCreate.currencyLabel")}
          </label>
          <SelectField
            id="currency"
            value={values.currency || DEFAULT_CURRENCY}
            ariaLabel={t("invoiceCreate.currencyLabel")}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            onChange={(next) => set("currency", next)}
          />
          {!supportsCzechQr(values.currency) && !values.btcInvoice ? (
            <p className="field-hint">{t("invoiceCreate.currencyNoQr")}</p>
          ) : null}

          {/* Which account this is payable to — shown once there is a choice
              to make. */}
          {bankAccounts.length > 1 && !values.btcInvoice ? (
            <>
              <label htmlFor="bankAccountId" className="form-label mt-3">
                {t("profile.bankTitle")}
              </label>
              <SelectField
                id="bankAccountId"
                value={values.bankAccountId}
                ariaLabel={t("profile.bankTitle")}
                options={bankAccounts.map((account) => ({
                  value: account.id,
                  label: account.currency
                    ? `${account.label} · ${account.currency}`
                    : account.label,
                }))}
                onChange={(next) => {
                  set("bankAccountId", next);
                  const account = bankAccounts.find((a) => a.id === next);
                  if (account?.currency) set("currency", account.currency);
                }}
              />
            </>
          ) : null}

          {isPoRequired ? (
            <>
              <label htmlFor="purchaseOrderNumber" className="form-label mt-3">
                {t("invoiceCreate.purchaseOrderLabel")}
              </label>
              <input
                id="purchaseOrderNumber"
                type="text"
                value={values.purchaseOrderNumber}
                onChange={(e) => set("purchaseOrderNumber", e.target.value)}
                placeholder={t("invoiceCreate.purchaseOrderPlaceholder")}
                className="form-input"
              />
            </>
          ) : null}
        </div>

        {sidebarFooter}
      </aside>
    </div>
  );
}
