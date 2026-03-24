import { useEffect, useState } from "react";
import { getRelayUrl } from "../evolu";

export function RelayStatusIndicator() {
  const [isConnected, setIsConnected] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );

  useEffect(() => {
    const relayUrl = getRelayUrl();
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(relayUrl);
    } catch {
      setIsConnected(false);
      return;
    }

    ws.onopen = () => setIsConnected(true);
    ws.onerror = () => setIsConnected(false);
    ws.onclose = () => setIsConnected(false);

    return () => {
      if (!ws) return;
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const updateTheme = () => setIsDarkMode(root.classList.contains("dark"));

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-2 shadow-sm backdrop-blur ${
          isDarkMode
            ? "border-slate-700 bg-slate-900/90"
            : "border-slate-300 bg-white/95 shadow-slate-900/10"
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            isConnected
              ? isDarkMode
                ? "bg-emerald-500"
                : "bg-emerald-600"
              : isDarkMode
                ? "bg-red-500"
                : "bg-red-600"
          }`}
          aria-hidden="true"
        />
        <span
          className={`text-xs font-semibold ${
            isDarkMode ? "text-slate-200" : "text-slate-800"
          }`}
        >
          {isConnected ? "Sync" : "Offline"}
        </span>
      </div>
    </div>
  );
}
