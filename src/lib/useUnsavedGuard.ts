import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
import { useI18n } from "../i18n";
import { useConfirm } from "./confirmContext";

/**
 * Asks before a half-filled form is walked away from.
 *
 * Everything in this app saves on a button, so a tab clicked in the nav or a
 * back gesture on a phone threw away whatever was typed without a word. This
 * blocks the navigation itself — every in-app route change goes through the
 * router, back and forward included — and puts the app's own dialog in front
 * of it. The browser's own prompt still covers a reload or a closed tab,
 * which nothing in the page can intercept.
 *
 * A page that can save from here passes `save`, and the dialog offers it as
 * its primary action — leaving is usually a change of mind about where to be,
 * not about the work. `save` reports whether it went through: a form that
 * fails validation stays where it is, with its errors on screen.
 *
 * Returns `release`, to be called on the way out of a successful save: the
 * page navigates in the same tick, before React has re-rendered with the form
 * no longer dirty, so the guard has to be told rather than deduce it.
 */
export const useUnsavedGuard = (
  dirty: boolean,
  save?: () => boolean | Promise<boolean>,
) => {
  const { t } = useI18n();
  const confirm = useConfirm();
  const dirtyRef = useRef(dirty);
  /* Kept in a ref as well as in state: the blocker below is registered once
     and asks the ref, so it always has the current answer without being
     re-registered — re-registering mid-navigation loses the block. */
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  /* Held the same way, so a page passing an inline callback does not
     re-register the blocker on every keystroke. */
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const blocker = useBlocker(useCallback(() => dirtyRef.current, []));
  const asking = useRef(false);

  useEffect(() => {
    if (blocker.state !== "blocked" || asking.current) return;
    asking.current = true;
    void confirm({
      title: t("alerts.unsavedTitle"),
      message: t("alerts.unsavedMessage"),
      confirmLabel: t("alerts.unsavedLeave"),
      altLabel: saveRef.current ? t("alerts.unsavedSave") : undefined,
      tone: "danger",
    })
      .then(async (answer) => {
        if (answer !== "alt") return answer === true;
        return (await saveRef.current?.()) ?? false;
      })
      .then((leave) => {
        asking.current = false;
        if (leave) {
          dirtyRef.current = false;
          blocker.proceed?.();
        } else {
          blocker.reset?.();
        }
      });
  }, [blocker, confirm, t]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      /* WebKit ignores preventDefault on its own and still asks for the
         deprecated returnValue, so Safari showed no prompt at all. */
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return {
    /** The form is saved; the next navigation is not a loss. */
    release: useCallback(() => {
      dirtyRef.current = false;
    }, []),
  };
};
