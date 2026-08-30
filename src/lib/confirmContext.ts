import { createContext, useContext } from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** `danger` styles the confirm button as destructive. */
  tone?: "danger" | "default";
};

export type NoticeTone = "info" | "success" | "error";

export type DialogApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** A transient in-app message, replacing `window.alert`. */
  notify: (message: string, tone?: NoticeTone) => void;
};

export const ConfirmContext = createContext<DialogApi | null>(null);

const useDialogs = () => {
  const api = useContext(ConfirmContext);
  if (!api) throw new Error("Dialog hooks used outside ConfirmProvider");
  return api;
};

export const useConfirm = () => useDialogs().confirm;
export const useNotify = () => useDialogs().notify;
