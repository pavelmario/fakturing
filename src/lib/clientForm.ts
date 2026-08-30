export type ClientFormValues = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  companyIdentificationNumber: string;
  vatNumber: string;
  note: string;
};

export const emptyClient = (): ClientFormValues => ({
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  companyIdentificationNumber: "",
  vatNumber: "",
  note: "",
});
