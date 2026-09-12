import en from "@/i18n/en.json"
import ja from "@/i18n/ja.json"
import type { UiLanguage } from "@/lib/user-settings"

export const SUPPORTED_UI_LANGUAGES: readonly UiLanguage[] = ["en", "ja"]

export const resources = {
  en: { translation: en },
  ja: { translation: ja },
} as const

export type TranslationResources = typeof resources
