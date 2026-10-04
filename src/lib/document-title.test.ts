import { i18n } from "@/i18n/i18n"
import { afterEach, describe, expect, it } from "vitest"
import { applyDocumentTitle, setPageTitle } from "./document-title"

afterEach(async () => {
  setPageTitle(null)
  await i18n.changeLanguage("en")
})

describe("setPageTitle", () => {
  it("uses the page title, then the site title once cleared", () => {
    setPageTitle("The Little Prince")
    expect(document.title).toBe("The Little Prince")

    applyDocumentTitle()
    expect(document.title).toBe("The Little Prince")

    setPageTitle("   ")
    expect(document.title).toBe("ParallelTexts")
  })
})
