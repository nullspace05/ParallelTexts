import { i18n } from "@/i18n/i18n"
import { useEffect } from "react"

/** Set while a book or alignment page is showing; language changes must not clear it. */
let pageTitle: string | null = null

export function setPageTitle(title: string | null) {
  const trimmed = title?.trim() ?? ""
  pageTitle = trimmed ? trimmed : null
  applyDocumentTitle()
}

/** Restores the site title, unless a page has set its own. */
export function applyDocumentTitle() {
  if (typeof document === "undefined") return
  document.title = pageTitle ?? i18n.t("meta.title")
}

export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    setPageTitle(title ?? null)
    return () => setPageTitle(null)
  }, [title])
}
