import { i18n } from "@/i18n/i18n"
import { afterEach, describe, expect, it } from "vitest"

afterEach(async () => {
  await i18n.changeLanguage("en")
  i18n.removeResourceBundle("en", "test")
})

describe("i18n", () => {
  it("falls back to English when Japanese lacks a key", () => {
    i18n.addResource("en", "translation", "test.fallback", "English fallback")

    expect(i18n.t("test.fallback", { lng: "ja" })).toBe("English fallback")
  })

  it("falls back to English for an unsupported language", () => {
    expect(i18n.t("settings.uiLanguage.heading", { lng: "fr" })).toBe(
      "Interface language"
    )
  })
})
