import type { SourceParagraph } from "@/types/alignment"

export interface TxtExtractResult {
  title: string
  coverDataUrl: null
}

export async function extractTxtMetadata(
  file: File
): Promise<TxtExtractResult> {
  // Use filename (without extension) as the title
  const title = file.name.replace(/\.txt$/i, "").trim() || file.name
  return { title, coverDataUrl: null }
}

/**
 * Split a plain-text blob into SourceParagraphs.
 * Paragraphs are delimited by one or more blank lines.
 */
export async function extractTxtContent(
  blob: Blob
): Promise<SourceParagraph[]> {
  const text = await blob.text()
  const rawParas = text.split(/\n{2,}/)

  const paragraphs: SourceParagraph[] = []
  let idx = 0
  for (const raw of rawParas) {
    // Plain-text sources (e.g. Project Gutenberg) are often hard-wrapped at a
    // fixed column with single line breaks mid-paragraph. Those are just
    // formatting, not word boundaries, so collapse them to a space rather
    // than leaving a literal newline glued between words.
    const cleaned = raw
      .replace(/\r/g, "")
      .replace(/[ \t]*\n+[ \t]*/g, " ")
      .trim()
    if (!cleaned) continue
    paragraphs.push({ para_idx: idx++, text: cleaned, images: [] })
  }

  return paragraphs
}
