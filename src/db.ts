// Local-first database setup for Invoice Manager
// Using localStorage with two-way Evolu relay sync and AES-256 encryption

import CryptoJS from "crypto-js";
import {
  deriveKeyFromMnemonic,
  encryptToString,
  decryptFromString,
} from "./encryption";

export interface UserProfile {
  id: string;
  name: string;
  mnemonic: string;
  // Contact Information
  email?: string;
  phone?: string;
  // Address
  addressLine1?: string;
  addressLine2?: string;
  // Company Information
  companyIdentificationNumber?: string;
  vatNumber?: string;
  // Banking Information
  bankAccount?: string;
  swift?: string;
  iban?: string;
  invoiceNamingFormat?: string;
  // UI language preference: 'cz' or 'en'
  language?: "cz" | "en";
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

export interface RelayMessage {
  type: "push" | "pull" | "pull-response" | "push-ack";
  userId?: string;
  data?: string; // Encrypted data
  timestamp?: number;
  // Alternative field names used by some relays
  u?: string; // userId
  d?: string; // data
  t?: number; // timestamp
}

export function getStoredMnemonic(): string | null {
  const value = localStorage.getItem(MNEMONIC_KEY);
  return value ? value : null;
}

export function storeMnemonic(mnemonic: string): void {
  const trimmed = mnemonic.trim();
  if (!trimmed) return;
  localStorage.setItem(MNEMONIC_KEY, trimmed);
}

const STORAGE_KEY = "invoiceApp_user";
const MNEMONIC_KEY = "invoiceApp_mnemonic"; // Store mnemonic separately for decryption
const RELAY_URL_DB = "invoiceApp_relaySettings";
const RELAY_URL_STORE = "relaySettings";
const DEFAULT_RELAY_URL = "ws://localhost:8080";

// Initialize relay settings database
let relaySettingsDb: IDBDatabase | null = null;

async function initRelaySettingsDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RELAY_URL_DB, 1);

    request.onerror = () => {
      console.warn("[initRelaySettingsDb] Failed to open IndexedDB");
      reject(request.error);
    };

    request.onsuccess = () => {
      relaySettingsDb = request.result;
      console.log("[initRelaySettingsDb] Relay settings DB initialized");
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(RELAY_URL_STORE)) {
        db.createObjectStore(RELAY_URL_STORE, { keyPath: "key" });
        console.log(
          "[initRelaySettingsDb] Created relay settings object store",
        );
      }
    };
  });
}

// Save relay URL to IndexedDB
export async function saveRelayUrl(url: string): Promise<void> {
  if (!relaySettingsDb) {
    await initRelaySettingsDb();
  }
  if (!relaySettingsDb) {
    console.warn("[saveRelayUrl] Failed to initialize IndexedDB");
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = relaySettingsDb!.transaction([RELAY_URL_STORE], "readwrite");
    const store = tx.objectStore(RELAY_URL_STORE);
    const request = store.put({ key: "relayUrl", value: url });

    request.onerror = () => {
      console.error("[saveRelayUrl] Failed to save:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log(`[saveRelayUrl] Saved relay URL: ${url}`);
      currentRelayUrl = url;
      resolve();
    };
  });
}

// Get relay URL from IndexedDB
export async function getRelayUrl(): Promise<string> {
  if (!relaySettingsDb) {
    await initRelaySettingsDb();
  }
  if (!relaySettingsDb) {
    console.warn("[getRelayUrl] Failed to initialize IndexedDB, using default");
    return DEFAULT_RELAY_URL;
  }

  return new Promise((resolve) => {
    const tx = relaySettingsDb!.transaction([RELAY_URL_STORE], "readonly");
    const store = tx.objectStore(RELAY_URL_STORE);
    const request = store.get("relayUrl");

    request.onerror = () => {
      console.error("[getRelayUrl] Failed to retrieve:", request.error);
      resolve(DEFAULT_RELAY_URL);
    };

    request.onsuccess = () => {
      const result = request.result;
      if (result && result.value) {
        console.log(`[getRelayUrl] Retrieved relay URL: ${result.value}`);
        currentRelayUrl = result.value;
        resolve(result.value);
      } else {
        console.log("[getRelayUrl] No saved URL, using default");
        resolve(DEFAULT_RELAY_URL);
      }
    };
  });
}

// Reconnect to relay with new URL
export async function reconnectToRelay(): Promise<void> {
  console.log("[reconnectToRelay] Disconnecting from current relay...");
  if (relayWs) {
    relayWs.close();
    relayWs = null;
  }
  notifyConnectionStatus(false);

  console.log("[reconnectToRelay] Reconnecting to relay...");
  await initializeRelayConnection();
}

// Fallback relay store using IndexedDB for persistence across windows/tabs
// Works even in incognito/private mode
const RELAY_STORE_DB = "invoiceApp_relayStore";
const RELAY_STORE_OBJECTSTORE = "relayData";

let relayDb: IDBDatabase | null = null;

async function initRelayDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RELAY_STORE_DB, 1);

    request.onerror = () => {
      console.warn("Failed to open IndexedDB relay store");
      reject(request.error);
    };

    request.onsuccess = () => {
      relayDb = request.result;
      console.log("[initRelayDb] IndexedDB relay store initialized");
      resolve();
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(RELAY_STORE_OBJECTSTORE)) {
        db.createObjectStore(RELAY_STORE_OBJECTSTORE, { keyPath: "userId" });
        console.log("[initRelayDb] Created object store");
      }
    };
  });
}

// Store data in IndexedDB relay
async function storeInRelayDb(
  userId: string,
  encryptedData: string,
): Promise<void> {
  if (!relayDb) {
    await initRelayDb();
  }
  if (!relayDb) {
    console.warn("[storeInRelayDb] Failed to initialize IndexedDB");
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = relayDb!.transaction([RELAY_STORE_OBJECTSTORE], "readwrite");
    const store = tx.objectStore(RELAY_STORE_OBJECTSTORE);
    const request = store.put({
      userId,
      data: encryptedData,
      timestamp: Date.now(),
    });

    request.onerror = () => {
      console.error(
        "[storeInRelayDb] Failed to store in IndexedDB:",
        request.error,
      );
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log(`[storeInRelayDb] Stored in IndexedDB for userId: ${userId}`);
      resolve();
    };
  });
}

// Retrieve data from IndexedDB relay
async function getFromRelayDb(
  userId: string,
): Promise<{ data: string; timestamp: number } | null> {
  if (!relayDb) {
    await initRelayDb();
  }
  if (!relayDb) {
    console.warn("[getFromRelayDb] Failed to initialize IndexedDB");
    return null;
  }

  return new Promise((resolve, reject) => {
    const tx = relayDb!.transaction([RELAY_STORE_OBJECTSTORE], "readonly");
    const store = tx.objectStore(RELAY_STORE_OBJECTSTORE);
    const request = store.get(userId);

    request.onerror = () => {
      console.error(
        "[getFromRelayDb] Failed to retrieve from IndexedDB:",
        request.error,
      );
      reject(request.error);
    };

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        console.log(
          `[getFromRelayDb] Found data in IndexedDB for userId: ${userId}`,
        );
        resolve({ data: result.data, timestamp: result.timestamp });
      } else {
        console.log(
          `[getFromRelayDb] No data in IndexedDB for userId: ${userId}`,
        );
        resolve(null);
      }
    };
  });
}

// Fallback in-memory relay store for cross-tab sync in incognito/private mode
const relayStore = new Map<string, { data: string; timestamp: number }>();

// Debug: expose relay store to window object
if (typeof window !== "undefined") {
  (window as any).__debugRelayStore = () => {
    console.log("=== Fallback Relay Store Debug ===");
    console.log(`Total entries: ${relayStore.size}`);
    relayStore.forEach((value, key) => {
      console.log(
        `  userId: ${key}, timestamp: ${new Date(value.timestamp).toISOString()}`,
      );
    });
    console.log("=================================");
  };
  (window as any).__activeMnemonic = () => activeMnemonic;
}

function deriveUserId(mnemonic: string): string {
  return CryptoJS.SHA256(mnemonic.trim()).toString();
}

let relayWs: WebSocket | null = null;
let currentRelayUrl: string = DEFAULT_RELAY_URL;
let reconnectAttempts = 0;
let pullScheduled = false;
let pendingPush: RelayMessage | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds
let activeMnemonic: string | null = null;

// Connection status listeners
const connectionListeners = new Set<(connected: boolean) => void>();
const profileListeners = new Set<(profile: UserProfile | null) => void>();
let storageListenerInitialized = false;

type RelayPersistenceStatus = "unknown" | "ok" | "no-persistence" | "error";
const relayPersistenceListeners = new Set<
  (status: RelayPersistenceStatus) => void
>();
let relayPersistenceStatus: RelayPersistenceStatus = "unknown";

type PendingRelayCheck = {
  userId: string;
  testData: string;
  timeoutId: number;
  resolve: (status: RelayPersistenceStatus) => void;
};

let pendingRelayCheck: PendingRelayCheck | null = null;

export function onConnectionStatusChange(
  callback: (connected: boolean) => void,
) {
  connectionListeners.add(callback);
  return () => connectionListeners.delete(callback);
}

function notifyConnectionStatus(connected: boolean) {
  connectionListeners.forEach((cb) => cb(connected));
}

function notifyRelayPersistenceStatus(status: RelayPersistenceStatus) {
  relayPersistenceStatus = status;
  relayPersistenceListeners.forEach((cb) => cb(status));
}

function notifyProfile(profile: UserProfile | null) {
  profileListeners.forEach((cb) => cb(profile));
}

export function onProfileChange(
  callback: (profile: UserProfile | null) => void,
) {
  profileListeners.add(callback);
  return () => profileListeners.delete(callback);
}

export function onRelayPersistenceStatusChange(
  callback: (status: RelayPersistenceStatus) => void,
) {
  relayPersistenceListeners.add(callback);
  return () => relayPersistenceListeners.delete(callback);
}

export function getRelayPersistenceStatus(): RelayPersistenceStatus {
  return relayPersistenceStatus;
}

function ensureStorageListener() {
  if (storageListenerInitialized || typeof window === "undefined") return;
  storageListenerInitialized = true;

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const updated = getUserProfile();
    notifyProfile(updated);
  });
}

// Check fallback relay for data with current mnemonic
async function checkFallbackRelay(): Promise<void> {
  if (!activeMnemonic) {
    console.log("[checkFallbackRelay] No active mnemonic, skipping");
    return;
  }

  const userId = deriveUserId(activeMnemonic);
  console.log(`[checkFallbackRelay] Checking for userId: ${userId}`);

  // Try IndexedDB first
  const storedData = await getFromRelayDb(userId);

  if (storedData) {
    console.log(
      `[checkFallbackRelay] ✓ Found data in relay for userId: ${userId}`,
    );
    try {
      const key = deriveKeyFromMnemonic(activeMnemonic);
      const relayProfile = decryptFromString<UserProfile>(storedData.data, key);
      if (relayProfile) {
        console.log(
          "[checkFallbackRelay] ✓ Decrypted and notifying profile from relay",
          relayProfile,
        );
        notifyProfile(relayProfile);
      } else {
        console.log("[checkFallbackRelay] ✗ Decryption returned null/falsy");
      }
    } catch (error) {
      console.error(
        "[checkFallbackRelay] ✗ Failed to decrypt from relay:",
        error,
      );
    }
  } else {
    console.log(
      `[checkFallbackRelay] ✗ No data in relay for userId: ${userId}`,
    );
  }
}

// Set the active mnemonic for encryption/decryption context
export function setActiveMnemonic(mnemonic: string | null): void {
  activeMnemonic = mnemonic?.trim() || null;
  console.log(
    `[setActiveMnemonic] mnemonic set: ${activeMnemonic ? "***" : "null"}`,
  );
  // Immediately check fallback relay when mnemonic is set
  if (activeMnemonic) {
    console.log(`[setActiveMnemonic] Calling checkFallbackRelay...`);
    checkFallbackRelay().catch(console.error);
  }
}

// Initialize relay connection with two-way sync
export async function initializeRelayConnection(): Promise<void> {
  if (relayWs) return;

  // Initialize relay settings DB and get saved URL
  await initRelaySettingsDb().catch(console.error);
  const relayUrl = await getRelayUrl();
  console.log(`[initializeRelayConnection] Using relay URL: ${relayUrl}`);

  // Initialize IndexedDB relay store
  await initRelayDb().catch(console.error);

  ensureStorageListener();

  try {
    relayWs = new WebSocket(relayUrl);

    relayWs.onopen = () => {
      console.log("[Relay] Connected to relay at " + currentRelayUrl);
      reconnectAttempts = 0;
      notifyConnectionStatus(true);

      if (pendingPush) {
        try {
          console.log("[Relay] Sending pending push after reconnect...");
          relayWs?.send(JSON.stringify(pendingPush));
          pendingPush = null;
        } catch (error) {
          console.error("[Relay] Failed to send pending push:", error);
        }
      }

      // Pull latest data from relay (coalesced)
      schedulePull("relay onopen");
    };

    relayWs.onerror = (error) => {
      console.error("Relay connection error:", error);
      notifyConnectionStatus(false);
    };

    relayWs.onclose = () => {
      console.log("Relay connection closed");
      notifyConnectionStatus(false);
      relayWs = null;

      // Attempt to reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(() => {
          console.log(
            `Reconnecting to relay (attempt ${reconnectAttempts})...`,
          );
          initializeRelayConnection();
        }, RECONNECT_DELAY);
      }
    };

    relayWs.onmessage = async (event) => {
      try {
        console.log(
          "[relayWs.onmessage] Message received, type:",
          typeof event.data,
        );
        let messageText: string;

        // Handle Blob messages
        if (event.data instanceof Blob) {
          console.log("[relayWs.onmessage] Processing Blob message");
          // Read as ArrayBuffer first, then decode
          const arrayBuffer = await event.data.arrayBuffer();
          messageText = new TextDecoder("utf-8").decode(arrayBuffer);
        } else if (event.data instanceof ArrayBuffer) {
          console.log("[relayWs.onmessage] Processing ArrayBuffer message");
          messageText = new TextDecoder("utf-8").decode(
            new Uint8Array(event.data),
          );
        } else {
          console.log("[relayWs.onmessage] Processing string message");
          messageText = String(event.data);
        }

        console.log(
          `[relayWs.onmessage] Raw message length: ${messageText.length}, first 80 chars:`,
          messageText.substring(0, 80),
        );

        // Remove BOM, null bytes, and non-printable characters
        const originalLength = messageText.length;
        messageText = messageText
          .replace(/^\uFEFF/, "") // Remove BOM first
          .replace(/\0/g, "") // Remove null bytes
          .trim();

        // Only remove leading non-JSON if we have more than just a quote
        if (
          messageText.length > 2 &&
          !messageText.startsWith("{") &&
          !messageText.startsWith("[")
        ) {
          const beforeClean = messageText.length;
          messageText = messageText.replace(/^[^{[]*/, "");
          console.log(
            `[relayWs.onmessage] Removed ${beforeClean - messageText.length} leading chars`,
          );
        }

        if (originalLength > messageText.length) {
          console.log(
            `[relayWs.onmessage] ✓ Cleaned message (removed ${originalLength - messageText.length} chars), cleaned length: ${messageText.length}`,
          );
        }

        if (!messageText) {
          console.log(
            "[relayWs.onmessage] ⚠ Message empty after cleanup (likely echo or keepalive), skipping",
          );
          return;
        }

        // Only process if it looks like JSON
        if (!messageText.startsWith("{") && !messageText.startsWith("[")) {
          console.warn(
            "[relayWs.onmessage] ✗ Message doesn't look like JSON after cleanup, skipping. Content:",
            messageText.substring(0, 100),
          );
          return;
        }

        const message: RelayMessage = JSON.parse(messageText);
        console.log(
          "[relayWs.onmessage] ✓ Parsed relay message type:",
          message.type,
          "userId:",
          message.userId,
        );
        handleRelayMessage(message);
      } catch (error) {
        // Only log non-JSON parsing errors, ignore JSON parse errors from non-JSON messages
        if (error instanceof SyntaxError) {
          // Silently skip JSON parsing errors - they're likely echo messages or other non-JSON data
          console.warn(
            "[relayWs.onmessage] JSON parse error (silently skipped):",
            (error as Error).message,
          );
        } else {
          console.error("[relayWs.onmessage] Error:", error);
        }
      }
    };
  } catch (error) {
    console.error("Failed to initialize relay connection:", error);
    notifyConnectionStatus(false);
  }
}

// Handle incoming messages from relay
function handleRelayMessage(message: RelayMessage) {
  const normalizedUserId = message.userId || message.u;
  const normalizedData = message.data ?? message.d;
  console.log(
    "[handleRelayMessage] Processing message type:",
    message.type,
    "userId:",
    normalizedUserId || "N/A",
  );

  if (pendingRelayCheck && normalizedUserId === pendingRelayCheck.userId) {
    if (message.type === "pull-response") {
      const isMatch = normalizedData === pendingRelayCheck.testData;
      clearTimeout(pendingRelayCheck.timeoutId);
      pendingRelayCheck.resolve(isMatch ? "ok" : "no-persistence");
      pendingRelayCheck = null;
      notifyRelayPersistenceStatus(isMatch ? "ok" : "no-persistence");
      console.log(
        "[handleRelayMessage] Relay persistence check result:",
        isMatch ? "✓ persisted" : "✗ not persisted",
      );
      return;
    }

    if (message.type === "pull") {
      clearTimeout(pendingRelayCheck.timeoutId);
      pendingRelayCheck.resolve("no-persistence");
      pendingRelayCheck = null;
      notifyRelayPersistenceStatus("no-persistence");
      console.log(
        "[handleRelayMessage] Relay persistence check result: ✗ relay echoed pull",
      );
      return;
    }

    if (message.type === "push-ack") {
      console.log(
        "[handleRelayMessage] Relay persistence check received push-ack",
      );
      return;
    }
  }

  if (message.type === "pull-response") {
    console.log("[handleRelayMessage] ★★★ PULL-RESPONSE RECEIVED ★★★");
    console.log(
      "[handleRelayMessage] Response data present:",
      !!normalizedData,
    );
    console.log(
      "[handleRelayMessage] Response data length:",
      normalizedData?.length || 0,
    );
    console.log(
      "[handleRelayMessage] Active mnemonic present:",
      !!activeMnemonic,
    );

    if (!normalizedData) {
      console.log(
        "[handleRelayMessage] ✗ pull-response has NO DATA - relay server did not return any stored data",
      );
      console.log(
        "[handleRelayMessage] This indicates the relay server is not persisting data or does not have data for this userId",
      );
      return;
    }

    // Decrypt relay data using the active mnemonic key
    if (!activeMnemonic) {
      console.log(
        "[handleRelayMessage] ✗ No active mnemonic to decrypt relay data",
      );
      return;
    }

    try {
      const key = deriveKeyFromMnemonic(activeMnemonic);
      const relayProfile = decryptFromString<UserProfile>(normalizedData, key);
      console.log(
        "[handleRelayMessage] Decryption result:",
        relayProfile ? "✓ success" : "✗ failed",
      );

      if (relayProfile) {
        console.log("[handleRelayMessage] ✓ Decrypted profile fields:", {
          name: !!relayProfile.name,
          email: !!relayProfile.email,
          phone: !!relayProfile.phone,
          addressLine1: !!relayProfile.addressLine1,
          companyId: !!relayProfile.companyIdentificationNumber,
          vatNumber: !!relayProfile.vatNumber,
          bankAccount: !!relayProfile.bankAccount,
          swift: !!relayProfile.swift,
          iban: !!relayProfile.iban,
        });
        // Merge with local data - newer version wins
        const local = getUserProfile();
        if (!local) {
          console.log(
            "[handleRelayMessage] Local database MISSING, saving relay data",
          );
          saveEncryptedProfile(relayProfile);
          notifyProfile(relayProfile);
        } else if (relayProfile.updatedAt > local.updatedAt) {
          console.log(
            `[handleRelayMessage] Relay data is NEWER (relay: ${new Date(relayProfile.updatedAt).toISOString()}, local: ${new Date(local.updatedAt).toISOString()}). Updating...`,
          );
          saveEncryptedProfile(relayProfile);
          notifyProfile(relayProfile);
        } else {
          console.log(
            `[handleRelayMessage] Local data is NEWER or SAME (local: ${new Date(local.updatedAt).toISOString()}, relay: ${new Date(relayProfile.updatedAt).toISOString()}). Keeping local.`,
          );
        }
      } else {
        console.error("[handleRelayMessage] ✗ Decryption returned falsy value");
      }
    } catch (error) {
      console.error("[handleRelayMessage] ✗ Error during decryption:", error);
    }
  } else if (message.type === "push-ack") {
    console.log("[handleRelayMessage] ✓ Push to relay acknowledged");
  } else if (message.type === "push") {
    console.log(
      "[handleRelayMessage] ⚠ Received push message from relay (real-time sync) - relay may be echoing back push requests",
    );
  } else if (message.type === "pull") {
    console.log(
      "[handleRelayMessage] ⚠⚠⚠ RELAY NOT SUPPORTING PROTOCOL: Relay echoed back pull request instead of pull-response",
    );
    console.log(
      "[handleRelayMessage] ⚠⚠⚠ This indicates relay does not implement persistent storage for push/pull messages",
    );
    console.log(
      "[handleRelayMessage] ⚠⚠⚠ For cross-session sync (incognito), you need a relay server that stores data",
    );
  } else {
    console.log("[handleRelayMessage] Unknown message type:", message.type);
  }
}

// Save encrypted profile to local storage
function saveEncryptedProfile(profile: UserProfile): void {
  try {
    const encryptionKey = deriveKeyFromMnemonic(profile.mnemonic);
    const encryptedData = encryptToString(profile, encryptionKey);
    localStorage.setItem(STORAGE_KEY, encryptedData);
    // Store mnemonic separately (unencrypted) to enable decryption on page load
    localStorage.setItem(MNEMONIC_KEY, profile.mnemonic);
    console.log(
      "[saveEncryptedProfile] Profile encrypted and saved to localStorage",
    );

    // Also store in IndexedDB relay for cross-window/incognito sync
    const userId = profile.id || deriveUserId(profile.mnemonic);
    storeInRelayDb(userId, encryptedData).catch(console.error);

    notifyProfile(profile);
  } catch (error) {
    console.error(
      "[saveEncryptedProfile] Failed to save encrypted profile:",
      error,
    );
  }
}

// Save user profile to local storage (encrypted) and sync to relay
export function saveUserProfile(
  profile: Omit<UserProfile, "id" | "createdAt" | "updatedAt">,
): UserProfile {
  const now = Date.now();
  const existing = getUserProfile();

  const stableId = deriveUserId(profile.mnemonic);

  const userProfile: UserProfile = {
    id: existing?.id || stableId,
    name: profile.name,
    mnemonic: profile.mnemonic,
    email: profile.email,
    phone: profile.phone,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    companyIdentificationNumber: profile.companyIdentificationNumber,
    vatNumber: profile.vatNumber,
    bankAccount: profile.bankAccount,
    swift: profile.swift,
    iban: profile.iban,
    invoiceNamingFormat:
      (profile as any).invoiceNamingFormat || existing?.invoiceNamingFormat ||
      "invoice-year-invoice_number",
    language: (profile as any).language || existing?.language || "cz",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  // Save encrypted locally
  saveEncryptedProfile(userProfile);

  // Notify listeners immediately
  notifyProfile(userProfile);

  // Set active mnemonic for subsequent decryptions
  setActiveMnemonic(userProfile.mnemonic);

  // Push encrypted to relay
  pushToRelay(userProfile);

  return userProfile;
}

// Load user profile from local storage (decrypted)
export function getUserProfile(): UserProfile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // If encrypted format, decrypt using the stored mnemonic or active mnemonic
    if (parsed.version && parsed.encrypted && parsed.iv) {
      // Try to get mnemonic from localStorage first
      const storedMnemonic = localStorage.getItem(MNEMONIC_KEY);
      const mnemonicToUse = storedMnemonic || activeMnemonic;

      if (!mnemonicToUse) {
        console.warn(
          "[getUserProfile] Encrypted data found but no mnemonic available",
        );
        return null;
      }

      // Set as active mnemonic if not already set
      if (!activeMnemonic && storedMnemonic) {
        setActiveMnemonic(storedMnemonic);
      }

      const encryptionKey = deriveKeyFromMnemonic(mnemonicToUse);
      const decrypted = decryptFromString<UserProfile>(stored, encryptionKey);
      if (decrypted) return decrypted;

      console.error("[getUserProfile] Failed to decrypt stored profile");
      return null;
    }

    // Backwards compatibility: plain JSON
    const asProfile = parsed as UserProfile;
    if (asProfile.name && asProfile.mnemonic) {
      // Set active mnemonic for future decryptions
      setActiveMnemonic(asProfile.mnemonic);
      return asProfile;
    }

    return null;
  } catch (error) {
    console.error("Error loading user profile:", error);
    return null;
  }
}

// Pull latest data from relay with retry logic
function schedulePull(reason: string): void {
  if (pullScheduled) {
    console.log(
      `[schedulePull] Pull already scheduled, skipping. Reason: ${reason}`,
    );
    return;
  }
  pullScheduled = true;
  console.log(`[schedulePull] Scheduling pull in 200ms. Reason: ${reason}`);
  setTimeout(async () => {
    pullScheduled = false;
    await pullFromRelay().catch(console.error);
  }, 200);
}

async function pullFromRelay(): Promise<void> {
  // Ensure a connection attempt is in flight
  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
    console.log(
      "[pullFromRelay] Relay not connected, attempting to (re)connect before pull",
      {
        ws: !!relayWs,
        readyState: relayWs?.readyState,
      },
    );
    try {
      await initializeRelayConnection();
    } catch (error) {
      console.error(
        "[pullFromRelay] Failed to initialize relay connection:",
        error,
      );
      return;
    }
  }

  // Wait for the socket to open (with timeout)
  const start = Date.now();
  const waitForOpen = (): Promise<void> => {
    return new Promise((resolve) => {
      const check = () => {
        if (relayWs && relayWs.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }
        if (Date.now() - start > 5000) {
          console.warn(
            "[pullFromRelay] Timed out waiting for WebSocket to open",
            {
              ws: !!relayWs,
              readyState: relayWs?.readyState,
            },
          );
          resolve();
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  };

  await waitForOpen();

  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
    console.warn(
      "[pullFromRelay] WebSocket still not open after wait; aborting pull",
      {
        ws: !!relayWs,
        readyState: relayWs?.readyState,
      },
    );
    return;
  }

  await performPull().catch(console.error);
}

async function waitForRelayOpen(timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      if (relayWs && relayWs.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

export async function runRelayPersistenceCheck(): Promise<RelayPersistenceStatus> {
  try {
    if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
      await initializeRelayConnection();
    }

    const isOpen = await waitForRelayOpen();
    if (!isOpen || !relayWs || relayWs.readyState !== WebSocket.OPEN) {
      notifyRelayPersistenceStatus("error");
      return "error";
    }

    if (pendingRelayCheck) {
      clearTimeout(pendingRelayCheck.timeoutId);
      pendingRelayCheck.resolve("error");
      pendingRelayCheck = null;
    }

    const userId = `__relay_check__:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const testData = `relay-check:${Date.now()}`;

    const statusPromise = new Promise<RelayPersistenceStatus>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        pendingRelayCheck = null;
        notifyRelayPersistenceStatus("no-persistence");
        resolve("no-persistence");
      }, 2500);

      pendingRelayCheck = {
        userId,
        testData,
        timeoutId,
        resolve,
      };
    });

    relayWs.send(
      JSON.stringify({
        type: "push" as const,
        userId,
        data: testData,
        timestamp: Date.now(),
        u: userId,
        d: testData,
        t: Date.now(),
      }),
    );

    setTimeout(() => {
      if (!relayWs || relayWs.readyState !== WebSocket.OPEN) return;
      relayWs.send(
        JSON.stringify({
          type: "pull" as const,
          userId,
          u: userId,
        }),
      );
    }, 150);

    const status = await statusPromise;
    return status;
  } catch (error) {
    console.error("[runRelayPersistenceCheck] Failed:", error);
    notifyRelayPersistenceStatus("error");
    return "error";
  }
}

async function performPull(): Promise<void> {
  console.log(
    "[performPull] START - Checking relay connection and local storage",
  );

  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
    console.warn("[performPull] WebSocket not open:", {
      ws: !!relayWs,
      readyState: relayWs?.readyState,
    });
    return;
  }

  const profile = getUserProfile();
  const userId =
    profile?.id || (activeMnemonic ? deriveUserId(activeMnemonic) : "new-user");

  console.log(`[performPull] userId for this pull: ${userId}`);
  console.log(`[performPull] activeMnemonic present: ${!!activeMnemonic}`);
  console.log(`[performPull] local profile present: ${!!profile}`);

  // First, check IndexedDB relay store (works across tabs and in incognito)
  if (activeMnemonic) {
    console.log(`[performPull] Checking IndexedDB relay store for userId...`);
    const storedData = await getFromRelayDb(userId);
    if (storedData) {
      console.log(
        `[performPull] ✓ FOUND data in IndexedDB relay! Data length: ${storedData.data?.length || 0} chars`,
      );
      try {
        const key = deriveKeyFromMnemonic(activeMnemonic);
        const relayProfile = decryptFromString<UserProfile>(
          storedData.data,
          key,
        );
        if (relayProfile) {
          console.log("[performPull] ✓ Successfully decrypted relay data:", {
            name: relayProfile.name,
            id: relayProfile.id,
          });
          const local = getUserProfile();
          if (!local) {
            // Local database missing - download from relay
            console.log(
              "[performPull] Local database MISSING, downloading from relay...",
            );
            saveEncryptedProfile(relayProfile);
            notifyProfile(relayProfile);
          } else if (relayProfile.updatedAt > local.updatedAt) {
            // Relay has newer data - update local
            console.log(
              `[performPull] Relay data is NEWER (relay: ${new Date(relayProfile.updatedAt).toISOString()}, local: ${new Date(local.updatedAt).toISOString()}). Updating...`,
            );
            saveEncryptedProfile(relayProfile);
            notifyProfile(relayProfile);
          } else {
            // Local data is newer or same - keep local
            console.log(
              `[performPull] Local data is NEWER or SAME, keeping local version`,
            );
          }
        } else {
          console.error("[performPull] ✗ Decryption returned falsy value");
        }
      } catch (error) {
        console.error(
          "[performPull] ✗ Failed to decrypt IndexedDB relay data:",
          error,
        );
      }
    } else {
      console.log(
        `[performPull] ✗ NO data found in IndexedDB relay for userId: ${userId}`,
      );
    }
  } else {
    console.log(
      "[performPull] ⚠ No active mnemonic, skipping IndexedDB relay check",
    );
  }

  // Send pull request to remote relay for latest data
  console.log("[performPull] Now requesting latest from remote relay...");
  const pullMessage = {
    type: "pull" as const,
    userId,
    u: userId,
  };

  console.log(
    "[performPull] Sending pull request to remote relay:",
    pullMessage,
  );
  try {
    relayWs.send(JSON.stringify(pullMessage));
    console.log(`[performPull] ✓ Pull request successfully sent to relay`);
  } catch (error) {
    console.error("[performPull] ✗ Failed to send pull request:", error);
  }
}

// Public helper to pull latest data when mnemonic is set
export function pullLatestFromRelay(): Promise<void> {
  schedulePull("pullLatestFromRelay");
  return Promise.resolve();
}

// Push encrypted data to relay
function pushToRelay(profile: UserProfile): void {
  if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
    try {
      const encryptionKey = deriveKeyFromMnemonic(profile.mnemonic);
      const encryptedData = encryptToString(profile, encryptionKey);
      const userId = profile.id || deriveUserId(profile.mnemonic);
      pendingPush = {
        type: "push",
        userId,
        data: encryptedData,
        timestamp: Date.now(),
        u: userId,
        d: encryptedData,
        t: Date.now(),
      };
      console.warn(
        "[pushToRelay] Relay not connected, queued push for next connection",
      );
      initializeRelayConnection().catch(console.error);
    } catch (error) {
      console.error("[pushToRelay] Failed to queue push:", error);
    }
    return;
  }

  try {
    const encryptionKey = deriveKeyFromMnemonic(profile.mnemonic);
    const encryptedData = encryptToString(profile, encryptionKey);
    const userId = profile.id || deriveUserId(profile.mnemonic);

    console.log("[pushToRelay] Preparing to push data for userId:", userId);
    console.log("[pushToRelay] Profile fields present:", {
      name: !!profile.name,
      email: !!profile.email,
      phone: !!profile.phone,
      addressLine1: !!profile.addressLine1,
      companyId: !!profile.companyIdentificationNumber,
      vatNumber: !!profile.vatNumber,
      bankAccount: !!profile.bankAccount,
      swift: !!profile.swift,
      iban: !!profile.iban,
    });

    // Store in IndexedDB relay for incognito/cross-tab sync
    storeInRelayDb(userId, encryptedData).catch(console.error);

    const pushMessage = {
      type: "push" as const,
      userId,
      data: encryptedData,
      timestamp: Date.now(),
      u: userId,
      d: encryptedData,
      t: Date.now(),
    };

    console.log(
      "[pushToRelay] Sending push message to remote relay (data length:",
      encryptedData.length,
      "chars)",
    );
    relayWs.send(JSON.stringify(pushMessage));

    console.log("[pushToRelay] Encrypted profile pushed to remote relay");
  } catch (error) {
    console.error("[pushToRelay] Failed to push to relay:", error);
  }
}

// Clear user profile (for testing)
export function clearUserProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(MNEMONIC_KEY);
  setActiveMnemonic(null);
  notifyProfile(null);
  console.log("[clearUserProfile] All local data cleared");
}

// Utility to set mnemonic context and optionally trigger a pull
export function activateMnemonicAndPull(mnemonic: string): Promise<void> {
  console.log("[activateMnemonicAndPull] Starting with mnemonic: ***");
  setActiveMnemonic(mnemonic);
  // setActiveMnemonic now calls checkFallbackRelay() automatically

  // Also check local storage immediately
  const localProfile = getUserProfile();
  if (localProfile) {
    console.log("[activateMnemonicAndPull] Found local profile, notifying:", {
      name: localProfile.name,
    });
    notifyProfile(localProfile);
  } else {
    console.log(
      "[activateMnemonicAndPull] No local profile found, will pull from relay",
    );
  }

  // Then pull latest from relay
  console.log("[activateMnemonicAndPull] Scheduling pull from relay...");
  schedulePull("activateMnemonicAndPull");
  return Promise.resolve();
}

// Diagnostic helper - run this in console for debugging
export function diagnoseSync(): void {
  console.group("📊 SYNC DIAGNOSTIC REPORT");

  console.log("=== CONNECTION STATUS ===");
  console.log(
    "WebSocket connected:",
    relayWs?.readyState === WebSocket.OPEN ? "✓ YES" : "✗ NO",
  );
  console.log("WebSocket readyState:", relayWs?.readyState);
  console.log("Current relay URL:", currentRelayUrl);
  console.log("Active mnemonic:", activeMnemonic ? "✓ SET" : "✗ NOT SET");

  console.log("\n=== LOCAL STORAGE ===");
  const storedMnemonic = localStorage.getItem(MNEMONIC_KEY);
  const storedProfile = localStorage.getItem(STORAGE_KEY);
  console.log("Stored mnemonic:", storedMnemonic ? "✓ EXISTS" : "✗ MISSING");
  console.log(
    "Stored profile:",
    storedProfile
      ? "✓ EXISTS (length: " + storedProfile.length + " chars)"
      : "✗ MISSING",
  );

  console.log("\n=== LOCAL PROFILE ===");
  const profile = getUserProfile();
  if (profile) {
    console.log("Name:", profile.name);
    console.log("Email:", profile.email);
    console.log("ID:", profile.id);
    console.log("Updated:", new Date(profile.updatedAt).toISOString());
  } else {
    console.log("✗ No local profile");
  }

  console.log("\n=== INDEXEDDB RELAY STORE ===");
  if (activeMnemonic) {
    const userId = deriveUserId(activeMnemonic);
    console.log("Current userId:", userId);
    getFromRelayDb(userId)
      .then((data) => {
        if (data) {
          console.log("✓ Data found in IndexedDB relay");
          console.log("Data length:", data.data?.length || 0, "chars");
          console.log("Stored at:", new Date(data.timestamp).toISOString());
        } else {
          console.log("✗ No data in IndexedDB relay for this userId");
        }
      })
      .catch((err) => console.error("Error checking IndexedDB:", err));
  } else {
    console.log("⚠ Cannot check - no active mnemonic");
  }

  console.log("\n=== ENVIRONMENT ===");
  console.log("Mode:", navigator.onLine ? "ONLINE" : "OFFLINE");
  console.log("User Agent:", navigator.userAgent.substring(0, 60) + "...");
  console.log("Window ID:", window.name || "unnamed");

  console.groupEnd();
}
