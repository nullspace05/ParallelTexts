import type { SourceParagraph } from "@/types/alignment"

export interface PdfExtractResult {
  title: string
  coverDataUrl: string | null
}

// Lazy load pdfjs-dist to avoid SSR issues
async function getPdfjsLib() {
  const pdfjsLib = await import("pdfjs-dist")
  return pdfjsLib
}

// Configure worker (required for pdfjs-dist). Do this once at app init.
async function initPdfWorker(): Promise<void> {
  if (typeof window === "undefined") return
  const pdfjsLib = await getPdfjsLib()
  if (pdfjsLib.GlobalWorkerOptions.workerSrc) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString()
}

export async function extractPdfMetadata(
  file: File
): Promise<PdfExtractResult> {
  await initPdfWorker()
  const pdfjsLib = await getPdfjsLib()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)

  const viewport = page.getViewport({ scale: 0.5 })
  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not get canvas context")

  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
  }).promise

  const coverDataUrl = canvas.toDataURL("image/jpeg", 0.8)
  const title = file.name.replace(/\.pdf$/i, "") || "Untitled PDF"

  return { title, coverDataUrl }
}

// ---------------------------------------------------------------------------
// New: structured paragraph extraction for the alignment pipeline
// ---------------------------------------------------------------------------

export interface RawPdfTextItem {
  str: string
  /** [scaleX, skewX, skewY, scaleY, translateX, translateY] */
  transform: number[]
  height: number
  hasEOL?: boolean
}

/**
 * Group pdfjs text items from a single page into paragraph strings.
 *
 * Items are assumed to arrive roughly in reading order (top-to-bottom,
 * left-to-right), which holds for standard reflowed text PDFs.
 *
 * Two heuristics detect boundaries:
 *   - Line break: Y changes by > 30 % of line height (or `hasEOL` is true)
 *   - Paragraph break: Y changes by > 220 % of line height
 *
 * Exported separately from the async pdfjs call so it can be unit-tested
 * without a Worker.
 */
export function groupItemsIntoParagraphs(items: RawPdfTextItem[]): string[] {
  if (items.length === 0) return []

  const paragraphs: string[] = []
  let lineBuffer = ""
  let paraLines: string[] = []
  let prevY: number | null = null
  let avgHeight = items.find((i) => i.height > 0)?.height ?? 12

  function flushLine() {
    const line = lineBuffer.trim()
    if (line) paraLines.push(line)
    lineBuffer = ""
  }

  function flushParagraph() {
    flushLine()
    const para = paraLines.join(" ").trim()
    if (para) paragraphs.push(para)
    paraLines = []
  }

  for (const item of items) {
    if (!item.str) continue

    const y = item.transform[5]
    const h = item.height > 0 ? item.height : avgHeight

    if (prevY !== null) {
      const dy = Math.abs(prevY - y)

      if (dy > h * 2.2) {
        // Large vertical gap → paragraph break
        flushParagraph()
      } else if (dy > h * 0.3) {
        // Smaller gap → line break within paragraph
        flushLine()
      }
    }

    lineBuffer += item.str

    // hasEOL is explicitly set when the item ends a line
    if (item.hasEOL) flushLine()

    prevY = y
    if (h > 0) avgHeight = h
  }

  flushParagraph()
  return paragraphs
}

/**
 * Extract structured paragraph content from a PDF for the alignment pipeline.
 *
 * Returns one SourceParagraph per detected paragraph block, with images: []
 * (PDFs carry raster images that can't be reliably re-associated with text).
 * Only call from browser / Web Worker context.
 */
export async function extractPdfContent(
  blob: Blob
): Promise<SourceParagraph[]> {
  await initPdfWorker()
  const pdfjsLib = await getPdfjsLib()

  const arrayBuffer = await blob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const allParaTexts: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    // Filter to concrete text items (skip TextMarkedContent markers)
    const textItems: RawPdfTextItem[] = content.items.flatMap((item) => {
      if (
        typeof item === "object" &&
        item !== null &&
        "str" in item &&
        "transform" in item
      ) {
        return [item]
      }
      return []
    })

    const pageParas = groupItemsIntoParagraphs(textItems)
    allParaTexts.push(...pageParas)
  }

  return allParaTexts.map((text, idx) => ({
    para_idx: idx,
    text,
    images: [],
  }))
}

// ---------------------------------------------------------------------------
// Legacy: flat text extraction (kept for backward compatibility)
// ---------------------------------------------------------------------------

/** Extract flat text from all pages of a PDF. */
export async function extractPdfText(blob: Blob): Promise<string> {
  await initPdfWorker()
  const pdfjsLib = await getPdfjsLib()

  const arrayBuffer = await blob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const texts: Array<string> = []

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim()
    if (pageText) texts.push(pageText)
  }

  return texts.join("\n\n")
}
