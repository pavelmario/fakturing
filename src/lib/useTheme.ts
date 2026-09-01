import { useEffect, useState } from "react";

/** Light/dark preference, persisted and applied as a class on <html>. */
export const useTheme = () => {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      document.documentElement.classList.toggle("dark", theme === "dark");
      /* The browser chrome has to follow the app, and the app follows a stored
         choice rather than the OS — a dark app under a light system otherwise
         gets a cream address bar. Read back from the token so the colour has
         one source of truth in tokens.css. */
      const paper = getComputedStyle(document.documentElement)
        .getPropertyValue("--paper")
        .trim();
      if (paper) {
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", paper);
      }
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return {
    theme,
    toggleTheme: () =>
      setTheme((current) => (current === "dark" ? "light" : "dark")),
  };
};
