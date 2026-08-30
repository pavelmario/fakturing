import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "../i18n";
import { DateField } from "./invoices/DateField";

type PaymentDialogProps = {
  invoiceNumber: string;
  clientName: string;
  amount: string;
  /** Prefilled date in `yyyy-mm-dd` form; defaults to today. */
  initialDate?: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
};

const today = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * Recording a payment used to stamp today's date the instant you clicked, with
 * no confirmation and no way back from the list. It now asks for the date —
 * payments are rarely received on the day you get around to filing them.
 */
export function PaymentDialog({
  invoiceNumber,
  clientName,
  amount,
  initialDate,
  onConfirm,
  onCancel,
}: PaymentDialogProps) {
  const { t } = useI18n();
  const [date, setDate] = useState(initialDate || today());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = () => {
    if (!date) return;
    onConfirm(date);
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("paymentDialog.title")}
      >
        <div className="dialog-head flex items-start justify-between gap-3">
          <div>
            <div className="dialog-title">{t("paymentDialog.title")}</div>
            <div className="dialog-sub">
              <span className="mono">{invoiceNumber}</span>
              {clientName ? ` · ${clientName}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ledger-action"
            style={{ opacity: 1 }}
            aria-label={t("common.cancel")}
          >
            <X />
          </button>
        </div>

        <div className="dialog-body">
          <div
            className="flex items-baseline justify-between gap-3 pb-3 mb-3"
            style={{ borderBottom: "1px solid var(--rule)" }}
          >
            <span
              className="section-title"
              style={{ letterSpacing: "0.09em" }}
            >
              {t("paymentDialog.amountLabel")}
            </span>
            <span
              className="num"
              style={{
                fontSize: "var(--fs-lg)",
                fontWeight: 500,
                letterSpacing: "-0.03em",
                color: "var(--ink)",
              }}
            >
              {amount}
            </span>
          </div>

          <label htmlFor="payment-dialog-date" className="form-label">
            {t("paymentDialog.dateLabel")}
          </label>
          {/* Deliberately unbounded: you may already know when the client
              pays and want to record it upfront. */}
          <DateField
            id="payment-dialog-date"
            value={date}
            ariaLabel={t("paymentDialog.dateLabel")}
            onChange={setDate}
          />
          <p
            className="settings-help-text"
            style={{ marginTop: "0.4375rem" }}
          >
            {t("paymentDialog.hint")}
          </p>
        </div>

        <div className="dialog-foot">
          <button type="button" onClick={onCancel} className="btn-secondary">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!date}
            className="btn-primary"
          >
            {t("paymentDialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
