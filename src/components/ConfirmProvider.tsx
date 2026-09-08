import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../i18n";
import {
  ConfirmContext,
  type ConfirmAnswer,
  type NoticeTone,
} from "../lib/confirmContext";

import type { ConfirmOptions } from "../lib/confirmContext";

type Pending = ConfirmOptions & { resolve: (answer: ConfirmAnswer) => void };



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
  /* The same question, held outside state so a second one can answer the
     first. Every confirm used to come from a click, and two could not
     overlap; the unsaved-changes guard asks from an effect, so now they can —
     and the replaced promise would otherwise never settle, leaving whatever
     awaited it half-done. */
  const pendingRef = useRef<Pending | null>(null);
  const [notices, setNotices] = useState<
    { id: number; message: string; tone: NoticeTone }[]
  >([]);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<ConfirmAnswer>((resolve) => {
        /* Superseded means declined: the caller waiting on it gets the same
           answer as if the dialog had been dismissed. */
        pendingRef.current?.resolve(false);
        const next = { ...options, resolve };
        pendingRef.current = next;
        setPending(next);
      }),
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

  const close = (answer: ConfirmAnswer) => {
    pending?.resolve(answer);
    pendingRef.current = null;
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
              {/* With a third option the destructive one stops being the
                  primary: "leave without saving" is what you pick on
                  purpose, not what the focus falls on. */}
              <button
                className={
                  pending.altLabel
                    ? "btn-secondary"
                    : pending.tone === "danger"
                      ? "btn-danger"
                      : "btn-primary"
                }
                onClick={() => close(true)}
                autoFocus={!pending.altLabel}
              >
                {pending.confirmLabel ?? t("common.confirm")}
              </button>
              {pending.altLabel ? (
                <button
                  className="btn-primary"
                  onClick={() => close("alt")}
                  autoFocus
                >
                  {pending.altLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
