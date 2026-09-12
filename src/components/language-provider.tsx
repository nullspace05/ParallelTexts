import { i18n } from "@/i18n/i18n"
import {
  getStoredUiLanguage,
  setStoredUiLanguage,
  type UiLanguage,
} from "@/lib/user-settings"
import { I18nextProvider } from "react-i18next"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

interface LanguageContextValue {
  language: UiLanguage
  ready: boolean
  setLanguage: (language: UiLanguage) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function setDocumentLanguage(language: UiLanguage) {
  document.documentElement.lang = language
}

function setDocumentMeta() {
  document.title = i18n.t("meta.title")
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", i18n.t("meta.description"))
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>("en")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const storedLanguage = getStoredUiLanguage()
    setLanguageState(storedLanguage)
    setDocumentLanguage(storedLanguage)
    void i18n.changeLanguage(storedLanguage).then(() => {
      setDocumentMeta()
      setReady(true)
    })
  }, [])

  const setLanguage = useCallback((nextLanguage: UiLanguage) => {
    setStoredUiLanguage(nextLanguage)
    setLanguageState(nextLanguage)
    setDocumentLanguage(nextLanguage)
    void i18n.changeLanguage(nextLanguage).then(() => setDocumentMeta())
  }, [])

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={{ language, ready, setLanguage }}>
        {children}
      </LanguageContext.Provider>
    </I18nextProvider>
  )
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
