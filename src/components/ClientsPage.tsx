import { useState } from "react";
import * as Evolu from "@evolu/common";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useUnsavedGuard } from "../lib/useUnsavedGuard";
import { ClientForm } from "./clients/ClientForm";
import { emptyClient, type ClientFormValues } from "../lib/clientForm";
import { useNotify } from "../lib/confirmContext";

type ClientsPageProps = {
  onClientCreated: () => void;
};

export function ClientsPage({ onClientCreated }: ClientsPageProps) {
  const { t } = useI18n();
  const notify = useNotify();
  const evolu = useEvolu();
  const [values, setValues] = useState<ClientFormValues>(emptyClient);
  const [nameError, setNameError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  /* Anything typed is worth a question before it is thrown away; a form
     touched and put back counts, which is the cheap side to err on. */
  const [touched, setTouched] = useState(false);

  /* Writing the client and leaving the page are separate: the guard saves
     without going anywhere, because you are already on your way somewhere
     the guard is about to take you. */
  const persist = (): boolean => {
    if (!values.name.trim()) {
      setNameError(t("alerts.clientNameRequired"));
      return false;
    }
    setIsSaving(true);
    const toNull = (value: string) => value.trim() || null;
    const result = evolu.insert("client", {
      name: values.name.trim(),
      email: toNull(values.email),
      phone: toNull(values.phone),
      addressLine1: toNull(values.addressLine1),
      addressLine2: toNull(values.addressLine2),
      companyIdentificationNumber: toNull(values.companyIdentificationNumber),
      vatNumber: toNull(values.vatNumber),
      note: toNull(values.note),
      fileNameAlias: toNull(values.fileNameAlias),
      emailSubject: toNull(values.emailSubject),
      emailBody: toNull(values.emailBody),
      deleted: Evolu.sqliteFalse,
    });
    setIsSaving(false);
    if (!result.ok) {
      console.error("Client insert error:", result.error);
      notify(t("alerts.clientSaveValidation"), "error");
      return false;
    }
    setTouched(false);
    return true;
  };

  const handleSave = () => {
    if (!persist()) return;
    guard.release();
    onClientCreated();
  };

  const guard = useUnsavedGuard(touched, () => persist());

  return (
    <div className="page-shell">
      <div className="page-container">
        <h1 className="page-title mb-5">{t("clientsForm.title")}</h1>
        <ClientForm
          values={values}
          nameError={nameError}
          onChange={(patch) => {
            setNameError(undefined);
            setTouched(true);
            setValues((prev) => ({ ...prev, ...patch }));
          }}
        />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary w-full mt-3"
        >
          {isSaving ? t("clientsForm.saving") : t("clientsForm.save")}
        </button>
      </div>
    </div>
  );
}
