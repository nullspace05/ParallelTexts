// Which languages each embedding model can actually encode, plus a shared
// code -> English-name catalog for the language pickers.
//
// Kept free of `@huggingface/transformers` (same constraint as
// `model-registry.ts`) so the light list/label surfaces that import it don't
// drag the ML runtime into their bundles.
//
// The per-model code lists here are a best-effort stand-in written from
// memory. Step 5 of .docs/feature_plans/06_model_aware_language_list.md pins
// them against the published model cards.

export interface LanguageOption {
  code: string
  label: string
  /** One of the ten most commonly-used languages (floated to the top). */
  popular?: boolean
}

/** `und` = undetermined; passed straight through to `Intl.Segmenter`. */
export const UND = "und"

/**
 * Union catalog: every code any model can claim, plus `und` and every code the
 * app has historically stored. Names are English exonyms.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  und: "Any / undetermined",
  ar: "Arabic",
  bg: "Bulgarian",
  ca: "Catalan",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  et: "Estonian",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  "fr-ca": "French (Canada)",
  gl: "Galician",
  gu: "Gujarati",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  hy: "Armenian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ka: "Georgian",
  ko: "Korean",
  ku: "Kurdish",
  lt: "Lithuanian",
  lv: "Latvian",
  mk: "Macedonian",
  mn: "Mongolian",
  mr: "Marathi",
  ms: "Malay",
  my: "Burmese",
  nb: "Norwegian Bokmål",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  "pt-br": "Portuguese (Brazil)",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  sl: "Slovenian",
  sq: "Albanian",
  sr: "Serbian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  ur: "Urdu",
  vi: "Vietnamese",
  zh: "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
}

/** The ten most commonly-used languages, in the order they should appear. */
export const POPULAR_LANGUAGE_CODES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "ja",
  "ko",
  "zh",
]

// The sentence-transformers `paraphrase-multilingual-*` family (mpnet + MiniLM)
// was trained on the same ~50-language parallel corpus, so both models share
// this list. `zh-cn` from the card is mapped to the app's `zh`.
const PARAPHRASE_MULTILINGUAL = [
  "ar",
  "bg",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "fa",
  "fi",
  "fr",
  "fr-ca",
  "gl",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "it",
  "ja",
  "ka",
  "ko",
  "ku",
  "lt",
  "lv",
  "mk",
  "mn",
  "mr",
  "ms",
  "my",
  "nb",
  "nl",
  "pl",
  "pt",
  "pt-br",
  "ro",
  "ru",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
  "zh-tw",
]

// EmbeddingGemma advertises "100+ languages" without a definitive public list,
// so it is treated as covering the whole catalog until Step 5 says otherwise.
const ALL_CODES = Object.keys(LANGUAGE_NAMES).filter((c) => c !== UND)

/** Model id -> the codes that model can encode (`und` is added separately). */
export const MODEL_LANGUAGE_CODES: Record<string, string[]> = {
  "Xenova/paraphrase-multilingual-mpnet-base-v2": PARAPHRASE_MULTILINGUAL,
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2": PARAPHRASE_MULTILINGUAL,
  // distiluse v2 is "multilingual knowledge distilled" over the same parallel
  // data as the paraphrase family — stand in with the same list for now.
  "Xenova/distiluse-base-multilingual-cased-v2": PARAPHRASE_MULTILINGUAL,
  "onnx-community/embeddinggemma-300m-ONNX": ALL_CODES,
}

function labelOf(code: string): string {
  return LANGUAGE_NAMES[code] ?? code
}

/** `und` first, then the popular codes in order, then the rest A–Z by name. */
function orderOptions(codes: Iterable<string>): LanguageOption[] {
  const available = new Set(codes)
  const popular = POPULAR_LANGUAGE_CODES.filter((c) => available.has(c))
  const popularSet = new Set(popular)
  const rest = [...available]
    .filter((c) => c !== UND && !popularSet.has(c))
    .sort((a, b) => labelOf(a).localeCompare(labelOf(b)))

  return [
    { code: UND, label: labelOf(UND) },
    ...popular.map((c) => ({ code: c, label: labelOf(c), popular: true })),
    ...rest.map((c) => ({ code: c, label: labelOf(c) })),
  ]
}

/**
 * The language options to offer for a given model. An unknown or undefined
 * model id falls back to the full catalog — never an empty list, so the picker
 * always works even before a model is chosen.
 */
export function getModelLanguages(
  modelId: string | undefined
): LanguageOption[] {
  const codes = (modelId && MODEL_LANGUAGE_CODES[modelId]) || ALL_CODES
  return orderOptions(codes)
}

/**
 * Ensure `code` is present in the option list, appending a synthetic entry if
 * the current model doesn't list it — so a language already saved on an
 * alignment stays selectable after the model changes.
 */
export function withSelectedCode(
  options: LanguageOption[],
  code: string
): LanguageOption[] {
  if (!code || options.some((o) => o.code === code)) return options
  return [...options, { code, label: labelOf(code) }]
}
