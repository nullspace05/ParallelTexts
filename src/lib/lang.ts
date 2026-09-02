// Language-tag helpers for the reading UI.
//
// CJK characters shared between Chinese and Japanese (Han unification) render
// with whichever glyph shape the *font* prefers, and the browser only picks a
// Japanese-preferring font when the element is tagged `lang="ja"`. Untagged
// text on a device whose default CJK font is Chinese (most Android builds, iOS
// PingFang) shows Japanese prose with Chinese letterforms. So every stretch of
// book text the reader renders gets an explicit `lang`.

/**
 * Normalize an app / EPUB / user language code to a BCP-47-ish tag suitable
 * for the HTML `lang` attribute and CSS `:lang()` matching.
 *
 * - lower-cases and converts `_` separators to `-`
 * - maps the legacy `"JP"` code (used by the sample catalog and some older
 *   records) to `"ja"`
 * - treats `""` / `"und"` (undetermined) as "no tag" and returns `""`
 *
 * Region/script subtags are preserved (`"zh-TW"` -> `"zh-tw"`) — `:lang(zh)`
 * still matches those, and keeping them lets the browser distinguish
 * traditional vs. simplified when it can.
 */
export function normalizeLang(code: string | null | undefined): string {
  if (!code) return ""
  let c = code.trim().toLowerCase().replace(/_/g, "-")
  if (!c || c === "und") return ""
  if (c === "jp" || c.startsWith("jp-")) c = c.replace(/^jp/, "ja")
  return c
}

// Hiragana, Katakana, Katakana phonetic ext, halfwidth Katakana.
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/
// Hangul syllables + conjoining/compatibility Jamo.
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/
// CJK Unified Ideographs, Ext A, compatibility ideographs, and the
// supplementary-plane ideograph range via its high-surrogate block.
const HAN = /[㐀-䶿一-鿿豈-﫿]|[\ud840-\ud87f][\udc00-\udfff]/

/**
 * Best-effort script-based detection for text with no declared language —
 * used by the standalone book reader, where `Book` carries no language.
 *
 * Kana is an unambiguous signal for Japanese and Hangul for Korean; text that
 * is only Han characters is treated as Chinese. Returns `""` when the sample
 * has no CJK content (Latin-script languages are left untagged so they keep
 * inheriting the document language).
 */
export function detectCjkLang(sample: string): "ja" | "ko" | "zh" | "" {
  if (KANA.test(sample)) return "ja"
  if (HANGUL.test(sample)) return "ko"
  if (HAN.test(sample)) return "zh"
  return ""
}

/**
 * Resolve the `lang` to render a block of text with: the declared code when
 * there is one, otherwise a guess from the text itself. Returns `undefined`
 * (rather than `""`) when nothing is known, so callers can spread it straight
 * onto an element and have the attribute omitted.
 */
export function resolveTextLang(
  declared: string | null | undefined,
  sample: string
): string | undefined {
  const norm = normalizeLang(declared)
  if (norm) return norm
  return detectCjkLang(sample) || undefined
}
