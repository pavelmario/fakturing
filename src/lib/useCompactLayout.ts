import { useSyncExternalStore } from "react";

/**
 * Whether the card layouts are showing in place of the ledger tables.
 *
 * The breakpoint stays in the stylesheet and nowhere else: the same media
 * query that reshapes the page sets `--compact: 1`, and this reads it back. A
 * `matchMedia("(max-width: 55.99rem)")` string here would put the number in
 * two files with nothing keeping them in step — and the two layouts quietly
 * disagreeing is the exact class of bug this switch exists to prevent.
 */
const read = (): boolean => {
  try {
    return (
      getComputedStyle(document.documentElement)
        .getPropertyValue("--compact")
        .trim() === "1"
    );
  } catch {
    return false;
  }
};

/* Read on first use rather than at module load, so the stylesheet is
   certainly applied by the time the value is taken. */
let current: boolean | null = null;
const listeners = new Set<() => void>();

const sync = () => {
  const next = read();
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
  }
  listeners.add(listener);
  /* A rotation between the first paint and this subscription would otherwise
     leave the stored value stale. */
  sync();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    }
  };
};

const getSnapshot = () => (current ??= read());

export const useCompactLayout = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
