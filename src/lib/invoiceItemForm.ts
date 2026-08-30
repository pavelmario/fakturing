/** The editable shape of an invoice line, kept as strings while in a form. */
export type InvoiceItemForm = {
  amount: string;
  unit: string;
  description: string;
  unitPrice: string;
  vat: string;
};

export const emptyItem = (): InvoiceItemForm => ({
  amount: "",
  unit: "",
  description: "",
  unitPrice: "",
  vat: "",
});
