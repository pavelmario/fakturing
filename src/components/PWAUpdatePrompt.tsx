import { ArrowUpCircle } from "lucide-react";
import { useI18n } from "../i18n";
import { usePWA } from "../hooks/usePWA";

/**
 * The one moment the app asks for something rather than being asked.
 *
 * It used to be a blue Tailwind box — the only blue in an amber, paper-and-ink
 * app, and the only surface not built from the design tokens, so it read as
 * something another site had dropped on the page. It is now the app's own card:
 * the accent rail that marks anything wanting attention, the two buttons every
 * other decision in the app is made with, and the same entrance the notices
 * use.
 *
 * It also says what pressing the button does. Updating reloads the page, and
 * with no invoice drafts yet that is worth knowing before you press it rather
 * than after — which is the whole point of the second choice being there.
 */
export function PWAUpdatePrompt() {
  const { t } = useI18n();
  const { needRefresh, updateServiceWorker, dismiss } = usePWA();

  if (!needRefresh) return null;

  return (
    <div className="pwa-prompt" role="status" aria-live="polite">
      <div className="pwa-card">
        <div className="pwa-card-head">
          <span className="pwa-card-mark" aria-hidden="true">
            <ArrowUpCircle />
          </span>
          <div className="pwa-card-body">
            <div className="pwa-card-title">{t("pwa.updateTitle")}</div>
            <p className="pwa-card-text">{t("pwa.updateAvailable")}</p>
            <p className="pwa-card-note">{t("pwa.updateHint")}</p>
          </div>
        </div>
        <div className="pwa-card-actions">
          <button
            className="btn-primary"
            onClick={() => updateServiceWorker(true)}
          >
            {t("pwa.updateNow")}
          </button>
          <button className="btn-ghost" onClick={dismiss}>
            {t("pwa.updateLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
