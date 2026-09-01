import { ArrowDown, ArrowUp } from "lucide-react";
import { useI18n } from "../../i18n";

type SortChipsProps<K extends string> = {
  keys: readonly { key: K; label: string }[];
  activeKey: K;
  dir: "asc" | "desc";
  onPick: (key: K) => void;
};

/**
 * Sorting lives in the ledger's column headers, and the card layout has none.
 * Below the table breakpoint this strip is the only way to reorder a list, so
 * it carries the same keys and the same "tap the lit one to flip direction"
 * behaviour the headers have.
 */
export function SortChips<K extends string>({
  keys,
  activeKey,
  dir,
  onPick,
}: SortChipsProps<K>) {
  const { t } = useI18n();

  return (
    <div className="sortbar" role="group" aria-label={t("common.sortBy")}>
      <span className="sortbar-label">{t("common.sortBy")}</span>
      {keys.map(({ key, label }) => {
        const on = key === activeKey;
        return (
          <button
            key={key}
            type="button"
            className="fchip"
            data-on={on}
            aria-pressed={on}
            onClick={() => onPick(key)}
          >
            {label}
            {on ? dir === "asc" ? <ArrowUp /> : <ArrowDown /> : null}
          </button>
        );
      })}
    </div>
  );
}
