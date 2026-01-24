import * as Evolu from "@evolu/common";
import { createEvolu, SimpleName } from "@evolu/common";
import { createUseEvolu, EvoluProvider } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";

const RELAY_URL_KEY = "invoiceApp_relayUrl";
const DEFAULT_RELAY_URL = "wss://free.evoluhq.com";

export const getRelayUrl = (): string => {
  if (typeof window === "undefined") return DEFAULT_RELAY_URL;
  const stored = window.localStorage.getItem(RELAY_URL_KEY);
  if (!stored) return DEFAULT_RELAY_URL;
  if (!stored.startsWith("ws://") && !stored.startsWith("wss://")) return DEFAULT_RELAY_URL;
  return stored;
};

export const setRelayUrl = (url: string): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RELAY_URL_KEY, url);
};

const UserProfileId = Evolu.id("UserProfile");

export const Schema = {
  userProfile: {
    id: UserProfileId,
    name: Evolu.NonEmptyTrimmedString100,
    email: Evolu.nullOr(Evolu.TrimmedString100),
    phone: Evolu.nullOr(Evolu.TrimmedString100),
    addressLine1: Evolu.nullOr(Evolu.TrimmedString1000),
    addressLine2: Evolu.nullOr(Evolu.TrimmedString1000),
    companyIdentificationNumber: Evolu.nullOr(Evolu.TrimmedString100),
    vatNumber: Evolu.nullOr(Evolu.TrimmedString100),
    bankAccount: Evolu.nullOr(Evolu.TrimmedString100),
    swift: Evolu.nullOr(Evolu.TrimmedString100),
    iban: Evolu.nullOr(Evolu.TrimmedString100),
  },
};

export type UserProfileInput = {
  name: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  companyIdentificationNumber?: string;
  vatNumber?: string;
  bankAccount?: string;
  swift?: string;
  iban?: string;
};

const evolu = createEvolu(evoluReactWebDeps)(Schema, {
  name: SimpleName.orThrow("invoice-manager"),
  transports: [{ type: "WebSocket", url: getRelayUrl() }],
});

export const useEvolu = createUseEvolu(evolu);
export { EvoluProvider, evolu };
