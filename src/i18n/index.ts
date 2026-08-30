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

/**
 * Czech takes three plural forms where English takes two: 1 faktura,
 * 2–4 faktury, 5+ faktur. Counts are rendered next to almost every figure in
 * the app, so getting this wrong is visible everywhere.
 */
const pluralForm = (language: Language, count: number): "one" | "few" | "many" => {
  const n = Math.abs(count);
  if (language === "cz") {
    if (n === 1) return "one";
    if (n >= 2 && n <= 4 && Number.isInteger(n)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "many";
};

export const createI18n = (language: Language) => {
  const locale = language === "en" ? "en-US" : "cs-CZ";
  const t = (key: string, vars?: TemplateVars): string => {
    const value = getValue(language, key) ?? getValue(fallbackLanguage, key);
    return formatTemplate(value ?? key, vars);
  };

  /** Resolves `<key>.one` / `.few` / `.many` for the given count. */
  const tp = (key: string, count: number, vars?: TemplateVars): string => {
    const form = pluralForm(language, count);
    const value =
      getValue(language, `${key}.${form}`) ??
      getValue(language, `${key}.many`) ??
      getValue(fallbackLanguage, `${key}.${form}`) ??
      getValue(fallbackLanguage, `${key}.many`);
    return formatTemplate(value ?? key, { count, ...vars });
  };

  return { language, locale, t, tp };
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
