import React from "react";
import { useTranslation } from "react-i18next";
import { IconGlobe } from "../Icons";
import { setLanguage, type SupportedLang } from "../../i18n";

const LANGUAGES: { code: SupportedLang; labelKey: string }[] = [
  { code: "vi", labelKey: "language.vi" },
  { code: "en", labelKey: "language.en" },
  { code: "ja", labelKey: "language.ja" },
];

export const LanguageSwitcher: React.FC = () => {
  const { t, i18n } = useTranslation();

  const currentLang = (i18n.language || "vi").split("-")[0] as SupportedLang;

  return (
    <div className="language-switcher">
      <label className="language-switcher__label">
        <IconGlobe size={16} />
        <span>{t("settings.language")}</span>
      </label>
      <div className="language-switcher__options">
        {LANGUAGES.map(({ code, labelKey }) => (
          <button
            key={code}
            className={`language-switcher__btn ${currentLang === code ? "active" : ""}`}
            onClick={() => setLanguage(code)}
            title={t(labelKey) as string}
          >
            {t(labelKey) as string}
          </button>
        ))}
      </div>
      <p className="language-switcher__hint">{t("settings.language_hint")}</p>
    </div>
  );
};
