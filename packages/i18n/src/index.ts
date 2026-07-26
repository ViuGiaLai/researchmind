import { viDict } from "./vi";
import { enDict } from "./en";

export type LocaleId = "vi" | "en";

export type I18nKey = keyof typeof viDict & keyof typeof enDict;

const dictionaries: Record<LocaleId, Record<I18nKey, string | readonly string[]>> = {
  vi: viDict,
  en: enDict,
};

/**
 * Translate a key to the given locale.
 * Falls back to English, then returns the key itself if not found in any locale.
 */
export function t(key: I18nKey, locale: LocaleId = "vi"): string {
  const dict = dictionaries[locale];
  if (dict && dict[key] !== undefined) {
    const val = dict[key];
    return typeof val === "string" ? val : String(val);
  }
  // Fallback to English
  const fallback = dictionaries.en[key];
  if (fallback !== undefined) {
    const val = fallback;
    return typeof val === "string" ? val : String(val);
  }
  return String(key);
}

/**
 * Translate with template interpolation.
 * Example: tpl("team.invite.success", { email: "a@b.com", role: "editor" }, "vi")
 */
export function tpl(
  key: I18nKey,
  vars: Record<string, string | number>,
  locale: LocaleId = "vi",
): string {
  let result = t(key, locale);
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(`{${k}}`, String(v));
  }
  return result;
}

export { viDict } from "./vi";
export { enDict } from "./en";
