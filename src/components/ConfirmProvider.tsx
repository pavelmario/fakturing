import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../i18n";
import { ConfirmContext, type NoticeTone } from "../lib/confirmContext";

import type { ConfirmOptions } from "../lib/confirmContext";

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };



/**
 * In-app confirmation, replacing `window.confirm`.
 *
 * The native dialog is drawn by the browser: it says "localhost:5173 says",
 * carries a "Don't show this again" checkbox the app cannot control, and looks
 * nothing like the rest of the product.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [pending, setPending] = useState<Pending | null>(null);
  const [notices, setNotices] = useState<
    { id: number; message: string; tone: NoticeTone }[]
  >([]);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const notify = useCallback(
    (message: string, tone: NoticeTone = "info") =>
      setNotices((all) => [...all, { id: Date.now() + Math.random(), message, tone }]),
    [],
  );

  /* Notices clear themselves; errors linger a little longer. */
  useEffect(() => {
    if (notices.length === 0) return;
    const timer = window.setTimeout(
      () => setNotices((all) => all.slice(1)),
      notices[0].tone === "error" ? 6000 : 3500,
    );
    return () => window.clearTimeout(timer);
  }, [notices]);

  const api = useMemo(() => ({ confirm, notify }), [confirm, notify]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={api}>
      {children}

      {notices.length > 0 ? (
        <div className="notices">
          {notices.map((notice) => (
            <div key={notice.id} className="notice" data-tone={notice.tone}>
              {notice.tone === "error" ? <AlertTriangle /> : null}
              <span>{notice.message}</span>
              <button
                type="button"
                onClick={() =>
                  setNotices((all) => all.filter((n) => n.id !== notice.id))
                }
                aria-label="×"
              >
                <X />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {pending ? (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
          >
            <div className="dialog-head">
              <div className="dialog-title confirm-title">
                {pending.tone === "danger" ? <AlertTriangle /> : null}
                {pending.title}
              </div>
              {pending.message ? (
                <div className="dialog-sub">{pending.message}</div>
              ) : null}
            </div>
            <div className="dialog-foot">
              <button className="btn-secondary" onClick={() => close(false)}>
                {t("common.cancel")}
              </button>
              <button
                className={
                  pending.tone === "danger" ? "btn-danger" : "btn-primary"
                }
                onClick={() => close(true)}
                autoFocus
              >
                {pending.confirmLabel ?? t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
