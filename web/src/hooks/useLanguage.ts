import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export type Language = "en" | "zh";

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLanguage = (i18n.language?.startsWith("zh") ? "zh" : "en") as Language;

  const setLanguage = useCallback(
    (lang: Language) => {
      void i18n.changeLanguage(lang);
    },
    [i18n]
  );

  const toggleLanguage = useCallback(() => {
    const next = currentLanguage === "en" ? "zh" : "en";
    void i18n.changeLanguage(next);
  }, [currentLanguage, i18n]);

  return {
    language: currentLanguage,
    setLanguage,
    toggleLanguage,
  };
}
