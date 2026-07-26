import { useI18n } from "@/i18n";

export function useLocale(): string {
  return useI18n().locale;
}
