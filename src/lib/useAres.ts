import { useState } from "react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useNotify } from "./confirmContext";

type AresSidlo = {
  textovaAdresa?: string | null;
  ulice?: string | null;
  nazevUlice?: string | null;
  cisloDomovni?: string | number | null;
  cisloOrientacni?: string | number | null;
  cisloOrientacniPismeno?: string | null;
  nazevCastiObce?: string | null;
  nazevObce?: string | null;
  psc?: string | number | null;
};

type AresResponse = {
  ico?: string | null;
  dic?: string | null;
  obchodniJmeno?: string | null;
  sidlo?: AresSidlo | null;
};

export type AresResult = {
  name?: string;
  vatNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
};

const formatAddressLines = (sidlo?: AresSidlo | null) => {
  const text = sidlo?.textovaAdresa?.trim();
  if (text) {
    const parts = text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return { line1: parts[0], line2: parts.slice(1).join(", ") };
    }
    return { line1: text, line2: "" };
  }

  const street = (sidlo?.ulice ?? sidlo?.nazevUlice)?.trim();
  const cisloDomovni = sidlo?.cisloDomovni ?? "";
  const cisloOrientacni = sidlo?.cisloOrientacni ?? "";
  const orientacniPismeno = sidlo?.cisloOrientacniPismeno ?? "";
  const houseNumber =
    `${cisloDomovni}${cisloOrientacni ? `/${cisloOrientacni}` : ""}${
      orientacniPismeno ? orientacniPismeno : ""
    }`.trim();
  const line1 = [street, houseNumber].filter(Boolean).join(" ");

  const pscValue = sidlo?.psc ?? "";
  const psc = pscValue ? String(pscValue).padStart(5, "0") : "";
  const city = sidlo?.nazevObce?.trim() || sidlo?.nazevCastiObce?.trim() || "";
  const line2 = [psc, city].filter(Boolean).join(" ");

  return { line1, line2 };
};

/**
 * Looks a company up in the Czech business register by IČO.
 *
 * Lived only on the client *create* page, so a client whose registered address
 * changed could never be refreshed from the register — you had to retype it.
 * It also never checked connectivity, so offline it reported a generic network
 * failure instead of saying you are offline (the string for which already
 * existed, unused).
 */
export const useAres = (
  t: (key: string) => string,
  onResult: (result: AresResult) => void,
) => {
  const notify = useNotify();
  const [isLoading, setIsLoading] = useState(false);
  const isOnline = useOnlineStatus();

  const lookup = async (rawIco: string) => {
    const ico = rawIco.replace(/\s+/g, "").trim();
    if (!ico) {
      notify(t("alerts.clientIcoRequired"), "error");
      return;
    }
    if (!isOnline) {
      notify(t("alerts.aresOffline"), "error");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${encodeURIComponent(
          ico,
        )}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) {
        notify(t("alerts.aresLoadFailed"), "error");
        return;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        notify(t("alerts.aresUnexpected"), "error");
        return;
      }
      const data = (await response.json()) as AresResponse;
      if (!data?.obchodniJmeno && !data?.sidlo) {
        notify(t("alerts.aresNoData"), "error");
        return;
      }
      const { line1, line2 } = formatAddressLines(data.sidlo);
      onResult({
        name: data.obchodniJmeno ?? undefined,
        vatNumber: data.dic ?? undefined,
        addressLine1: line1 || undefined,
        addressLine2: line2 || undefined,
      });
    } catch (error) {
      console.error("Error loading ARES data:", error);
      notify(t("alerts.aresLoadError"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, lookup, isOnline };
};
