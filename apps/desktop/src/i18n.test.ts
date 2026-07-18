import { afterEach, describe, expect, it } from "vitest";

import i18n, { setLanguage } from "./i18n";
import en from "./locales/en/common.json";

describe("i18n runtime integration", () => {
  afterEach(async () => {
    await i18n.changeLanguage("vi");
  });

  it("switches translations at runtime", async () => {
    setLanguage("en");
    await i18n.changeLanguage("en");
    expect(i18n.resolvedLanguage).toBe("en");
    expect(i18n.t("settings.title")).toBe("Settings");

    setLanguage("vi");
    await i18n.changeLanguage("vi");
    expect(i18n.resolvedLanguage).toBe("vi");
    expect(i18n.t("settings.title")).toBe("C\u00e0i \u0111\u1eb7t");
  });

  it("falls back to English for a key missing from Vietnamese", async () => {
    i18n.addResource("en", "common", "test.fallback_only", "English fallback");
    await i18n.changeLanguage("vi");
    expect(i18n.t("test.fallback_only")).toBe("English fallback");
    i18n.removeResourceBundle("en", "common");
    i18n.addResourceBundle("en", "common", en, true, true);
  });

  it("returns the key when no locale defines a translation", async () => {
    await i18n.changeLanguage("vi");
    expect(i18n.t("test.key_missing_everywhere")).toBe("test.key_missing_everywhere");
  });
});
