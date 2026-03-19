import { useEffect, useState } from "react";
import { getRelayUrl } from "../evolu";

export function RelayStatusIndicator() {
  const [isConnected, setIsConnected] = useState(false);

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
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            isConnected ? "bg-emerald-500" : "bg-red-500"
          }`}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
          {isConnected ? "synced" : "offline"}
        </span>
      </div>
    </div>
  );
}
