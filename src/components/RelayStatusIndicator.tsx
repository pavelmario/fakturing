import { useEffect, useState } from "react";
import { getRelayUrl } from "../evolu";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function RelayStatusIndicator() {
  const isOnline = useOnlineStatus();
  const [isConnected, setIsConnected] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const reconnectDelayMs = 3000;
    const connectTimeoutMs = 6000;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let connectTimer: number | undefined;
    let disposed = false;

    const clearTimers = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (connectTimer !== undefined) {
        window.clearTimeout(connectTimer);
        connectTimer = undefined;
      }
    };

    const closeSocket = () => {
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
      ws = null;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, reconnectDelayMs);
    };

    const connect = () => {
      if (disposed) return;

      closeSocket();

      try {
        ws = new WebSocket(getRelayUrl());
      } catch {
        setIsConnected(false);
        scheduleReconnect();
        return;
      }

      connectTimer = window.setTimeout(() => {
        if (!ws || ws.readyState !== WebSocket.CONNECTING) return;
        ws.close();
      }, connectTimeoutMs);

      ws.onopen = () => {
        if (disposed) return;
        if (connectTimer !== undefined) {
          window.clearTimeout(connectTimer);
          connectTimer = undefined;
        }
        setIsConnected(true);
      };

      ws.onerror = () => {
        if (disposed) return;
        setIsConnected(false);
      };

      ws.onclose = () => {
        if (disposed) return;
        if (connectTimer !== undefined) {
          window.clearTimeout(connectTimer);
          connectTimer = undefined;
        }
        ws = null;
        setIsConnected(false);
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();
      closeSocket();
    };
  }, [isOnline]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const updateTheme = () => setIsDarkMode(root.classList.contains("dark"));

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  const displayConnected = isOnline && isConnected;

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
            displayConnected
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
          {displayConnected ? "Sync" : "Relay Offline"}
        </span>
      </div>
    </div>
  );
}
