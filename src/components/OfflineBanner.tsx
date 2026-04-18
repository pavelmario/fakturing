import { useI18n } from "../i18n";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineBanner() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex h-[20px] items-center justify-center bg-amber-500 px-4 text-[10px] font-medium text-black shadow-md">
      {t("pwa.offline")}
    </div>
  );
}
