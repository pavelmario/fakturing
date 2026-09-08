export type ClientFormValues = {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  companyIdentificationNumber: string;
  vatNumber: string;
  note: string;
  /** What `{klient}` becomes in an exported filename. */
  fileNameAlias: string;
  /* Blank means the covering e-mail is worded the way Settings words it. */
  emailSubject: string;
  emailBody: string;
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
  fileNameAlias: "",
  emailSubject: "",
  emailBody: "",
});
