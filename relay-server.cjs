const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.RELAY_PORT ? Number(process.env.RELAY_PORT) : 8080;
const DATA_FILE = process.env.RELAY_DATA_FILE || path.join(__dirname, "relay-data.json");

const wss = new WebSocket.Server({ port: PORT });

const dataStore = new Map();
let saveTimer = null;

const loadStore = () => {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([userId, value]) => {
      if (value && typeof value === "object") {
        dataStore.set(userId, value);
      }
    });
    console.log(`[relay] Loaded ${dataStore.size} records from ${DATA_FILE}`);
  } catch (error) {
    console.error("[relay] Failed to load data file:", error);
  }
};

const saveStore = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const obj = Object.fromEntries(dataStore.entries());
      fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
      console.log(`[relay] Persisted ${dataStore.size} records to ${DATA_FILE}`);
    } catch (error) {
      console.error("[relay] Failed to save data file:", error);
    }
  }, 250);
};

loadStore();

console.log(`Relay server running on ws://localhost:${PORT}`);
console.log(`Relay data file: ${DATA_FILE}`);

wss.on("connection", (ws) => {
  ws.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      if (!message || typeof message !== "object") return;
      const userId = message.userId;
      if (!userId) return;

      if (message.type === "push") {
        dataStore.set(userId, {
          data: message.data,
          timestamp: message.timestamp || Date.now(),
        });
        saveStore();
        ws.send(JSON.stringify({ type: "push-ack", userId }));
        return;
      }

      if (message.type === "pull") {
        const stored = dataStore.get(userId);
        ws.send(
          JSON.stringify({
            type: "pull-response",
            userId,
            data: stored?.data || null,
            timestamp: stored?.timestamp,
          })
        );
      }
    } catch (error) {
      console.error("Relay error:", error);
    }
  });
});
