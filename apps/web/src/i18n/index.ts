import { useSettingsStore } from "@/store/settings.store";
import {
  t as i18nt,
  tpl as i18ntpl,
  type I18nKey,
  type LocaleId,
} from "@researchmind/i18n";
import { env } from "@/lib/env";

export type Locale = LocaleId;

const LOCALE_KEY = "rm_locale";

function readLocale(): Locale {
  try {
    const { settings } = useSettingsStore.getState();
    if (settings?.locale === "vi" || settings?.locale === "en") return settings.locale;
  } catch {
    // store not available
  }
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  if (stored === "vi" || stored === "en") return stored;
  return env.defaultLocale || "vi";
}

function persistLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // localStorage not available
  }
}

/**
 * Get current locale from settings, localStorage, or env default.
 */
export function getLocale(): Locale {
  return readLocale();
}

/**
 * Translate key using current locale.
 * Supports optional interpolation params (`{var}` syntax).
 */
export function t(key: I18nKey | string, params?: Record<string, string | number>): string {
  if (params) return i18ntpl(key as any, params, getLocale());
  return i18nt(key as any, getLocale());
}

/**
 * Translate with template interpolation.
 */
export function tpl(key: I18nKey | string, vars: Record<string, string | number>): string {
  return i18ntpl(key as any, vars, getLocale());
}

/**
 * React hook to access translation function with reactivity.
 */
export function useI18n() {
  const settings = useSettingsStore((s) => s.settings);
  const locale: LocaleId = settings?.locale === "vi" ? "vi" : settings?.locale === "en" ? "en" : readLocale();
  return {
    locale,
    t: (key: I18nKey | string, params?: Record<string, string | number>) => params ? i18ntpl(key as any, params, locale) : i18nt(key as any, locale),
    tpl: (key: I18nKey | string, vars: Record<string, string | number>) => i18ntpl(key as any, vars, locale),
  };
}