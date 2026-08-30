import { Plus, X } from "lucide-react";
import { useI18n } from "../../i18n";
import type { InvoiceItemForm } from "../../lib/invoiceItemForm";

type InvoiceItemsTableProps = {
  items: InvoiceItemForm[];
  isVatPayer: boolean;
  /** Show Množství + Jednotka — see `usesQuantity`. */
  showQuantity: boolean;
  disabled?: boolean;
  onChange: (index: number, field: keyof InvoiceItemForm, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  formatAmount: (value: number) => string;
};

/** Blank quantity reads as one, matching what gets saved. */
const num = (value: string, blank = 0) => {
  if (!value.trim()) return blank;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Line items as a ledger, not a stack of cards.
 *
 * Each item used to be a full-width panel with its own heading, a four-column
 * grid and a red "remove" button, so a five-line invoice ran well past a
 * screen. One row per line reads faster, keeps the figures in one alignable
 * column, and leaves room for a per-line total — which the form never showed.
 */
export function InvoiceItemsTable({
  items,
  isVatPayer,
  showQuantity,
  disabled = false,
  onChange,
  onAdd,
  onRemove,
  formatAmount,
}: InvoiceItemsTableProps) {
  const { t } = useI18n();

  return (
    <div className="items-block">
      <table className="items-table">
        <thead>
          <tr>
            <th>{t("invoiceCreate.itemDescription")}</th>
            {showQuantity ? (
              <>
                <th className="items-num">
                  {t("invoiceCreate.itemAmount")}
                </th>
                <th>{t("invoiceCreate.itemUnit")}</th>
              </>
            ) : null}
            <th className="items-num">
              {showQuantity
                ? t("invoiceCreate.itemUnitPrice")
                : t("invoiceCreate.itemPrice")}
            </th>
            {isVatPayer ? (
              <th className="items-num">{t("invoiceCreate.itemVat")}</th>
            ) : null}
            <th className="items-num">{t("invoiceCreate.itemTotal")}</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            /* Net, so the column sums to the "základ bez DPH" beside it —
               VAT is summarised once at the bottom, as on the document.
               Quantity counts only while billing per unit: with the switch
               off the saved line is 1 × price, and this cell has to agree. */
            const lineTotal =
              (showQuantity ? num(item.amount, 1) : 1) * num(item.unitPrice);
            return (
              <tr key={index}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={item.description}
                    disabled={disabled}
                    placeholder={t("invoiceCreate.itemDescriptionPlaceholder")}
                    onChange={(e) =>
                      onChange(index, "description", e.target.value)
                    }
                    aria-label={t("invoiceCreate.itemDescription")}
                  />
                </td>
                {showQuantity ? (
                  <>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="cell-input cell-num"
                        value={item.amount}
                        disabled={disabled}
                        placeholder="1"
                        onChange={(e) =>
                          onChange(index, "amount", e.target.value)
                        }
                        aria-label={t("invoiceCreate.itemAmount")}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="cell-input"
                        value={item.unit}
                        disabled={disabled}
                        placeholder={t("invoiceCreate.itemUnitPlaceholder")}
                        onChange={(e) =>
                          onChange(index, "unit", e.target.value)
                        }
                        aria-label={t("invoiceCreate.itemUnit")}
                      />
                    </td>
                  </>
                ) : null}
                <td>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="cell-input cell-num"
                    value={item.unitPrice}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(index, "unitPrice", e.target.value)
                    }
                    aria-label={t("invoiceCreate.itemUnitPrice")}
                  />
                </td>
                {isVatPayer ? (
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className="cell-input cell-num"
                      value={item.vat}
                      disabled={disabled}
                      onChange={(e) => onChange(index, "vat", e.target.value)}
                      aria-label={t("invoiceCreate.itemVat")}
                    />
                  </td>
                ) : null}
                <td className="items-line-total num">
                  {formatAmount(lineTotal)}
                </td>
                <td>
                  <button
                    type="button"
                    className="ledger-action items-remove"
                    disabled={disabled}
                    onClick={() => onRemove(index)}
                    aria-label={t("invoiceCreate.itemRemove")}
                    title={t("invoiceCreate.itemRemove")}
                  >
                    <X />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button
        type="button"
        className="items-add"
        onClick={onAdd}
        disabled={disabled}
      >
        <Plus />
        {t("invoiceCreate.addItem")}
      </button>
    </div>
  );
}
