import {
  DEFAULT_UI_LANGUAGE,
  getStoredUiLanguage,
  setStoredUiLanguage,
} from "@/lib/user-settings"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("UI language preference", () => {
  it("defaults to English when no preference is stored", () => {
    expect(getStoredUiLanguage()).toBe(DEFAULT_UI_LANGUAGE)
  })

  it("stores and reads Japanese", () => {
    expect(setStoredUiLanguage("ja")).toBe(true)
    expect(getStoredUiLanguage()).toBe("ja")
  })

  it("falls back to English for an unsupported stored value", () => {
    localStorage.setItem("pt:uiLanguage", "fr")

    expect(getStoredUiLanguage()).toBe("en")
  })

  it("falls back to English when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError")
    })

    expect(getStoredUiLanguage()).toBe("en")
  })
})
