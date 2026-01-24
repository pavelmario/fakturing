import CryptoJS from "crypto-js";

/**
 * Encryption utilities for securing user data
 * Uses AES-256 encryption with keys derived from the mnemonic
 */

const ENCRYPTION_VERSION = "1";

export interface EncryptedData {
  version: string;
  encrypted: string;
  iv: string;
}

/**
 * Derive a 256-bit encryption key from a mnemonic using PBKDF2
 * @param mnemonic - The BIP39 mnemonic phrase
 * @returns A 256-bit key suitable for AES encryption
 */
export function deriveKeyFromMnemonic(mnemonic: string): string {
  const salt = "invoiceapp:encryption";
  const key = CryptoJS.PBKDF2(mnemonic.trim(), salt, {
    keySize: 256 / 32, // 256 bits / 32 bits per word
    iterations: 1000,
    hasher: CryptoJS.algo.SHA256,
  });
  return key.toString();
}

/**
 * Encrypt data using AES-256-GCM
 * @param data - The data to encrypt (will be JSON stringified)
 * @param encryptionKey - The encryption key (derived from mnemonic)
 * @returns Encrypted data with version and IV
 */
export function encryptData(data: unknown, encryptionKey: string): EncryptedData {
  // Generate a random IV
  const iv = CryptoJS.lib.WordArray.random(16);

  // Serialize data to JSON
  const plaintext = JSON.stringify(data);

  // Encrypt using AES-256-CBC (AES-GCM not directly supported in crypto-js)
  const encrypted = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Hex.parse(encryptionKey), {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    version: ENCRYPTION_VERSION,
    encrypted: encrypted.toString(),
    iv: iv.toString(),
  };
}

/**
 * Decrypt data that was encrypted with encryptData
 * @param encryptedData - The encrypted data object
 * @param encryptionKey - The encryption key (derived from mnemonic)
 * @returns Decrypted and parsed data, or null if decryption fails
 */
export function decryptData<T>(encryptedData: EncryptedData, encryptionKey: string): T | null {
  try {
    if (encryptedData.version !== ENCRYPTION_VERSION) {
      console.error("Unsupported encryption version:", encryptedData.version);
      return null;
    }

    const decrypted = CryptoJS.AES.decrypt(encryptedData.encrypted, CryptoJS.enc.Hex.parse(encryptionKey), {
      iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    return JSON.parse(plaintext) as T;
  } catch (error) {
    console.error("Failed to decrypt data:", error);
    return null;
  }
}

/**
 * Encrypt data to a string (for storage/transmission)
 */
export function encryptToString(data: unknown, encryptionKey: string): string {
  const encrypted = encryptData(data, encryptionKey);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt data from a string
 */
export function decryptFromString<T>(encryptedString: string, encryptionKey: string): T | null {
  try {
    const encryptedData = JSON.parse(encryptedString) as EncryptedData;
    return decryptData<T>(encryptedData, encryptionKey);
  } catch (error) {
    console.error("Failed to parse encrypted data:", error);
    return null;
  }
}
