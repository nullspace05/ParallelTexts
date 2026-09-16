import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isPhoneLikeDevice,
  needsMobileAlignmentWarning,
  needsMobileComputeWarning,
  rememberMobileComputeConsent,
} from "./mobile-compute-warning"

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe("mobile compute warning", () => {
  it("recognizes a coarse-pointer phone viewport", () => {
    expect(
      isPhoneLikeDevice({
        innerWidth: 390,
        innerHeight: 844,
        matchMedia: () => ({ matches: true }),
      })
    ).toBe(true)
  })

  it("does not warn on a desktop-style pointer or tablet-sized viewport", () => {
    expect(
      isPhoneLikeDevice({
        innerWidth: 390,
        innerHeight: 844,
        matchMedia: () => ({ matches: false }),
      })
    ).toBe(false)
    expect(
      isPhoneLikeDevice({
        innerWidth: 834,
        innerHeight: 1194,
        matchMedia: () => ({ matches: true }),
      })
    ).toBe(false)
  })

  it("requires fresh consent for a larger model", () => {
    vi.stubGlobal("window", {
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: () => ({ matches: true }),
    })

    expect(needsMobileComputeWarning(470)).toBe(true)
    rememberMobileComputeConsent(470)
    expect(needsMobileComputeWarning(470)).toBe(false)
    expect(needsMobileComputeWarning(1110)).toBe(true)
  })

  it("always warns before alignment on a phone, even after download consent", () => {
    vi.stubGlobal("window", {
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: () => ({ matches: true }),
    })

    rememberMobileComputeConsent(1230)
    expect(needsMobileComputeWarning(470)).toBe(false)
    expect(needsMobileAlignmentWarning()).toBe(true)
  })
})
