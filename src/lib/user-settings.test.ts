import {
  DEFAULT_UI_LANGUAGE,
  dismissWebGPUUnavailableNotice,
  getInitialUiLanguage,
  getStoredUiLanguage,
  hasDismissedWebGPUUnavailableNotice,
  setStoredUiLanguage,
} from "@/lib/user-settings"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  localStorage.clear()
  document.documentElement.lang = "en"
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

  it("uses the Worker's Japanese document language without a saved preference", () => {
    document.documentElement.lang = "ja"

    expect(getInitialUiLanguage()).toBe("ja")
  })

  it("prefers an explicit English setting over the Worker's country default", () => {
    document.documentElement.lang = "ja"
    localStorage.setItem("pt:uiLanguage", "en")

    expect(getInitialUiLanguage()).toBe("en")
  })
})

describe("WebGPU unavailable notice", () => {
  it("is not dismissed by default", () => {
    expect(hasDismissedWebGPUUnavailableNotice()).toBe(false)
  })

  it("remains dismissed after the user closes it", () => {
    dismissWebGPUUnavailableNotice()

    expect(hasDismissedWebGPUUnavailableNotice()).toBe(true)
  })
})
