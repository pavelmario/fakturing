export type ExpenseFormValues = {
  description: string;
  expenseDate: string;
  expenseNumber: string;
  amountWithoutVat: string;
  vatRate: string;
  amountWithVat: string;
  supplierVat: string;
};

export const emptyExpense = (isVatPayer: boolean): ExpenseFormValues => ({
  description: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  expenseNumber: "",
  amountWithoutVat: "",
  vatRate: isVatPayer ? "21" : "0",
  amountWithVat: "",
  supplierVat: "",
});
