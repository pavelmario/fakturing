import { createContext, useContext } from "react";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  /**
   * A third way out, offered as the primary action — "save and leave" beside
   * "leave without saving". Answered with `"alt"`.
   */
  altLabel?: string;
  /** `danger` styles the confirm button as destructive. */
  tone?: "danger" | "default";
};

/** `true` confirmed, `false` cancelled, `"alt"` took the third option. */
export type ConfirmAnswer = boolean | "alt";

export type NoticeTone = "info" | "success" | "error";

export type DialogApi = {
  confirm: (options: ConfirmOptions) => Promise<ConfirmAnswer>;
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
