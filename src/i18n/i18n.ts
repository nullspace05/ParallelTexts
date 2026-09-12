import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { resources, SUPPORTED_UI_LANGUAGES } from "@/i18n/resources"

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  supportedLngs: [...SUPPORTED_UI_LANGUAGES],
  returnNull: false,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export { i18n }
