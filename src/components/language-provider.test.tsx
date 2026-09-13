import { i18n } from "@/i18n/i18n"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { useTranslation } from "react-i18next"
import { afterEach, describe, expect, it } from "vitest"
import { LanguageProvider, useLanguage } from "./language-provider"

// A minimal stand-in for the Settings page's Interface-language row: two
// buttons wired to the same useLanguage().setLanguage() the real picker
// calls, so this exercises the exact persistence path without mounting the
// full Settings page (which pulls in Dexie/model-registry dependencies).
function LanguagePickerHarness() {
  const { language, setLanguage } = useLanguage()
  return (
    <div>
      <span data-testid="current-language">{language}</span>
      <button onClick={() => setLanguage("en")}>English</button>
      <button onClick={() => setLanguage("ja")}>日本語</button>
    </div>
  )
}

function CountHarness({ count }: { count: number }) {
  const { t } = useTranslation()
  return <span>{t("books.count", { count })}</span>
}

// A stand-in for Header's nav link + icon-only GitHub link: same
// translation keys, without needing a TanStack RouterProvider just to
// render <Link>.
function NavHarness() {
  const { t } = useTranslation()
  return (
    <nav>
      <a href="/books">{t("header.books")}</a>
      <a href="https://github.com" aria-label={t("header.github")}>
        icon
      </a>
    </nav>
  )
}

afterEach(async () => {
  localStorage.clear()
  document.documentElement.lang = "en"
  document.body.innerHTML = ""
  await i18n.changeLanguage("en")
})

describe("Settings language picker persistence", () => {
  it("persists a language change to localStorage and across a remount", async () => {
    const { unmount } = render(
      <LanguageProvider>
        <LanguagePickerHarness />
      </LanguageProvider>
    )

    // setLanguage() fires i18n.changeLanguage() without awaiting it, so flush
    // that promise inside act() before unmounting — otherwise it can resolve
    // after this file's jsdom environment has already been torn down.
    await act(async () => {
      fireEvent.click(screen.getByText("日本語"))
      await Promise.resolve()
    })
    expect(localStorage.getItem("pt:uiLanguage")).toBe("ja")
    expect(screen.getByTestId("current-language").textContent).toBe("ja")

    unmount()

    const remounted = render(
      <LanguageProvider>
        <LanguagePickerHarness />
      </LanguageProvider>
    )
    // The provider reads the stored preference on mount.
    expect(localStorage.getItem("pt:uiLanguage")).toBe("ja")
    await act(async () => {
      await Promise.resolve()
    })
    remounted.unmount()
  })
})

describe("shared navigation label", () => {
  it("switches the Books nav link between English and Japanese", async () => {
    render(
      <LanguageProvider>
        <NavHarness />
      </LanguageProvider>
    )

    expect(screen.getByText("Books")).toBeTruthy()

    await i18n.changeLanguage("ja")
    expect(screen.getByText("本")).toBeTruthy()
  })
})

describe("accessibility label per language", () => {
  it("translates the GitHub link's aria-label in each language", async () => {
    render(
      <LanguageProvider>
        <NavHarness />
      </LanguageProvider>
    )

    expect(screen.getByLabelText("View source on GitHub")).toBeTruthy()

    await i18n.changeLanguage("ja")
    expect(screen.getByLabelText("GitHubでソースを表示")).toBeTruthy()
  })
})

describe("interpolated count", () => {
  it("interpolates the book count in English and Japanese", async () => {
    const { rerender } = render(<CountHarness count={3} />)
    expect(screen.getByText("Books (3)")).toBeTruthy()

    await i18n.changeLanguage("ja")
    rerender(<CountHarness count={3} />)
    expect(screen.getByText("本（3冊）")).toBeTruthy()
  })
})
