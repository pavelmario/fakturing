import { use, useMemo } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import strings from "./strings.json";

export type Language = keyof typeof strings;

type TemplateVars = Record<string, string | number>;

const fallbackLanguage: Language = "cz";

const normalizeLanguage = (value?: string | null): Language =>
  value === "en" ? "en" : "cz";

const getValue = (language: Language, key: string): string | undefined => {
  const parts = key.split(".");
  let current: unknown = strings[language];
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    current = record[part];
  }
  return typeof current === "string" ? current : undefined;
};

const formatTemplate = (template: string, vars?: TemplateVars): string => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
};

export const createI18n = (language: Language) => {
  const locale = language === "en" ? "en-US" : "cs-CZ";
  const t = (key: string, vars?: TemplateVars): string => {
    const value = getValue(language, key) ?? getValue(fallbackLanguage, key);
    return formatTemplate(value ?? key, vars);
  };

  return { language, locale, t };
};

export const useI18n = (overrideLanguage?: Language) => {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const languageQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["language"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const languageRows = useQuery(languageQuery);
  const language =
    overrideLanguage ?? normalizeLanguage(languageRows[0]?.language ?? null);

  return createI18n(language);
};
