import type { SourceParagraph } from "@/types/alignment"

export interface SentenceRecord {
  text: string
  para_idx: number
  sent_idx: number
  global_idx: number
}

export const MAX_SENTENCES = 10_000

/** Map app language codes to BCP-47 locales for Intl.Segmenter. */
function toLangLocale(lang: string): string {
  switch (lang.toLowerCase()) {
    case "jp":
    case "ja":
      return "ja"
    case "zh":
    case "zh-cn":
    case "zh-tw":
      return lang.toLowerCase()
    case "ko":
      return "ko"
    default:
      // "en", "fr", "de", "es", etc. pass through as-is; "und" = undetermined
      return lang || "und"
  }
}

/**
 * Split a list of SourceParagraphs into flat SentenceRecords using Intl.Segmenter.
 *
 * Each record carries its origin paragraph index (para_idx), its position within
 * that paragraph (sent_idx), and a global flat index across all paragraphs (global_idx).
 *
 * If the total sentence count exceeds MAX_SENTENCES the result is truncated and
 * `truncated` is set to true on the returned object — the caller should surface a
 * warning to the user.
 *
 * Only call from browser / Web Worker context (Intl.Segmenter is a browser built-in).
 */
export function splitIntoSentences(
  paragraphs: SourceParagraph[],
  lang: string,
  maxSentences = MAX_SENTENCES
): { records: SentenceRecord[]; truncated: boolean } {
  const locale = toLangLocale(lang)
  const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" })

  const records: SentenceRecord[] = []
  let globalIdx = 0
  let truncated = false

  for (const para of paragraphs) {
    if (!para.text.trim()) continue

    const segments = [...segmenter.segment(para.text)]
    let sentIdx = 0

    for (const seg of segments) {
      const text = seg.segment.trim()
      if (!text) continue

      if (globalIdx >= maxSentences) {
        truncated = true
        break
      }

      records.push({
        text,
        para_idx: para.para_idx,
        sent_idx: sentIdx++,
        global_idx: globalIdx++,
      })
    }

    if (truncated) break
  }

  return { records, truncated }
}

/** Convenience: extract just the text strings from SentenceRecords. */
export function getSentenceTexts(records: SentenceRecord[]): string[] {
  return records.map((r) => r.text)
}
