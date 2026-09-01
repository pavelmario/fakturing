import { useI18n } from "../i18n";
import { usePWA } from "../hooks/usePWA";

export function PWAUpdatePrompt() {
  const { t } = useI18n();
  const { needRefresh, updateServiceWorker, dismiss } = usePWA();

  if (!needRefresh) return null;

  return (
    <div className="pwa-prompt">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-lg dark:border-blue-800 dark:bg-blue-950">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
          {t("pwa.updateAvailable")}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => updateServiceWorker(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            {t("pwa.updateNow")}
          </button>
          <button
            onClick={dismiss}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900"
          >
            {t("pwa.updateLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
