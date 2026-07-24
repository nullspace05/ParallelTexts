import ePub from "epubjs"
import JSZip from "jszip"

import { extractPtEpubSourceParagraphs } from "@/lib/pt-epub"
import type { ImageAsset, SourceParagraph } from "@/types/alignment"

export interface EpubExtractResult {
  title: string
  coverDataUrl: string | null
}

export async function extractEpubMetadata(
  file: File
): Promise<EpubExtractResult> {
  const arrayBuffer = await file.arrayBuffer()
  const book = ePub(arrayBuffer as unknown as string, { encoding: "binary" })

  await book.ready

  const metadata = book.packaging.metadata
  const title =
    metadata.title.trim() || file.name.replace(/\.epub$/i, "") || "Untitled"

  let coverDataUrl: string | null = null
  try {
    const coverUrl = await book.coverUrl()
    if (coverUrl) {
      const blob = await fetch(coverUrl).then((r) => r.blob())
      coverDataUrl = await blobToDataUrl(blob)
    }
  } catch {
    // No cover or failed to extract
  }

  return { title, coverDataUrl }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ---------------------------------------------------------------------------
// New: structured paragraph + image extraction via JSZip
// Only call from browser context (event handlers, Web Workers).
// ---------------------------------------------------------------------------

const BS_BLOCK_CLASS = /^bs\d*$/

/** Resolve a relative href against a base path within the zip. */
function resolveZipHref(basePath: string, href: string): string {
  const dir = basePath.split("/").slice(0, -1).join("/")
  const raw = dir ? `${dir}/${href}` : href
  const parts = raw.split("/")
  const resolved: string[] = []
  for (const part of parts) {
    if (part === "..") resolved.pop()
    else if (part && part !== ".") resolved.push(part)
  }
  return resolved.join("/")
}

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "png":
      return "image/png"
    case "gif":
      return "image/gif"
    case "webp":
      return "image/webp"
    case "svg":
      return "image/svg+xml"
    default:
      return "application/octet-stream"
  }
}

async function extractImages(
  el: Element,
  xhtmlPath: string,
  zip: JSZip
): Promise<ImageAsset[]> {
  const assets: ImageAsset[] = []
  const seen = new Set<string>()

  for (const img of Array.from(el.querySelectorAll("img"))) {
    const src = img.getAttribute("src")
    if (!src || seen.has(src)) continue
    seen.add(src)

    const resolved = resolveZipHref(xhtmlPath, src)
    const file = zip.file(resolved) ?? zip.file(resolved.replace(/^\//, ""))
    if (!file) continue

    const b64 = await file.async("base64")
    assets.push({
      id: resolved,
      mime_type: guessMimeType(resolved),
      data_base64: b64,
    })
  }

  // SVG <image> elements use href or xlink:href instead of src
  for (const img of Array.from(el.querySelectorAll("image"))) {
    const src =
      img.getAttribute("href") ??
      img.getAttributeNS("http://www.w3.org/1999/xlink", "href")
    if (!src || seen.has(src) || /^https?:\/\//i.test(src)) continue
    seen.add(src)

    const resolved = resolveZipHref(xhtmlPath, src)
    const file = zip.file(resolved) ?? zip.file(resolved.replace(/^\//, ""))
    if (!file) continue

    const b64 = await file.async("base64")
    assets.push({
      id: resolved,
      mime_type: guessMimeType(resolved),
      data_base64: b64,
    })
  }

  return assets
}

async function parseXhtmlBlocks(
  html: string,
  xhtmlPath: string,
  zip: JSZip
): Promise<Array<{ text: string; images: ImageAsset[] }>> {
  const parser = new DOMParser()
  let doc = parser.parseFromString(html, "application/xhtml+xml")

  // If the XHTML isn't well-formed XML, DOMParser returns a <parsererror>
  // document instead of the actual content. Fall back to HTML parsing.
  if (
    doc.documentElement?.localName === "parsererror" ||
    doc.querySelector("parsererror")
  ) {
    doc = parser.parseFromString(html, "text/html")
  }

  // Strip furigana
  doc.querySelectorAll("rt").forEach((el) => el.remove())

  function norm(el: Element): string {
    // Source XHTML is often hard-wrapped for readability (e.g. "she\nlooked").
    // A line break is just formatting, not a word boundary, but simply
    // dropping it (as opposed to collapsing it to a space) glues adjacent
    // words together for space-delimited languages. Mirror how browsers
    // render HTML text: collapse newlines to a single space.
    return (el.textContent ?? "").replace(/[ \t]*[\n\r]+[ \t]*/g, " ").trim()
  }

  async function toBlock(
    el: Element
  ): Promise<{ text: string; images: ImageAsset[] }> {
    return { text: norm(el), images: await extractImages(el, xhtmlPath, zip) }
  }

  function hasContent(b: { text: string; images: ImageAsset[] }): boolean {
    return b.text.length > 0 || b.images.length > 0
  }

  // Priority 1: Calibre fixed-layout divs (div.bs, div.bs1, …)
  const bsDivs = Array.from(doc.querySelectorAll("div[class]")).filter(
    (div) => {
      const classes = (div.getAttribute("class") ?? "").split(/\s+/)
      return classes.some((c) => BS_BLOCK_CLASS.test(c))
    }
  )
  if (bsDivs.length >= 3) {
    const results = await Promise.all(bsDivs.map(toBlock))
    return results.filter(hasContent)
  }

  // Priority 2: <p> tags
  const pTags = Array.from(doc.querySelectorAll("p"))
  if (pTags.length > 0) {
    const results = await Promise.all(pTags.map(toBlock))
    const filtered = results.filter(hasContent)
    if (filtered.length > 0) return filtered
  }

  // Priority 3: Calibre vertical JP divs (div.calibre2 or class containing "parag")
  const calibreDivs = Array.from(doc.querySelectorAll("div[class]")).filter(
    (div) => {
      const classes = (div.getAttribute("class") ?? "").split(/\s+/)
      return classes.some((c) => c === "calibre2" || c.includes("parag"))
    }
  )
  if (calibreDivs.length > 0) {
    const results = await Promise.all(calibreDivs.map(toBlock))
    return results.filter(hasContent)
  }

  // Priority 4: Walk the DOM splitting on <br> and block boundaries.
  // Handles Aozora-style EPUBs that use <br/> instead of <p> tags.
  const bodyEl = doc.body ?? doc.querySelector("body") ?? doc.documentElement
  if (bodyEl) {
    const lines: Array<{ text: string; images: ImageAsset[] }> = []
    let current = ""

    const BLOCK_TAGS = new Set([
      "div",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "section",
      "article",
      "blockquote",
      "li",
      "td",
      "th",
    ])

    function flush() {
      const t = current.trim()
      if (t) lines.push({ text: t, images: [] })
      current = ""
    }

    async function walk(node: Node): Promise<void> {
      if (node.nodeType === Node.TEXT_NODE) {
        current += (node.textContent ?? "").replace(/[ \t]*[\n\r]+[ \t]*/g, " ")
      } else if (node.nodeName.toLowerCase() === "br") {
        flush()
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        const tag = el.tagName.toLowerCase()
        if (tag === "img") {
          flush()
          const src = el.getAttribute("src")
          if (src) {
            const resolved = resolveZipHref(xhtmlPath, src)
            const imgFile =
              zip.file(resolved) ?? zip.file(resolved.replace(/^\//, ""))
            if (imgFile) {
              const b64 = await imgFile.async("base64")
              lines.push({
                text: "",
                images: [
                  {
                    id: resolved,
                    mime_type: guessMimeType(resolved),
                    data_base64: b64,
                  },
                ],
              })
            }
          }
        } else {
          const isBlock = BLOCK_TAGS.has(tag)
          if (isBlock) flush()
          for (const child of Array.from(node.childNodes)) await walk(child)
          if (isBlock) flush()
        }
      }
    }

    await walk(bodyEl)
    flush()

    const brResult = lines.filter(hasContent)
    if (brResult.length > 0) return brResult
  }

  return []
}

/** Parse container.xml + OPF to get XHTML spine paths in reading order. */
async function getSpinePaths(zip: JSZip): Promise<string[]> {
  const containerXml = await zip.file("META-INF/container.xml")?.async("string")
  if (!containerXml) return []

  // Use localName-based lookup to avoid XML namespace issues
  const containerDoc = new DOMParser().parseFromString(containerXml, "text/xml")
  const allContainerEls = Array.from(containerDoc.getElementsByTagName("*"))
  const rootfileEl = allContainerEls.find((el) => el.localName === "rootfile")
  const opfPath = rootfileEl?.getAttribute("full-path")
  if (!opfPath) return []

  const opfXml = await zip.file(opfPath)?.async("string")
  if (!opfXml) return []

  const opfDir = opfPath.split("/").slice(0, -1).join("/")

  const opfDoc = new DOMParser().parseFromString(opfXml, "text/xml")
  const allOpfEls = Array.from(opfDoc.getElementsByTagName("*"))

  const manifest: Record<string, string> = {}
  const navIds = new Set<string>()
  allOpfEls
    .filter((el) => el.localName === "item")
    .forEach((item) => {
      const id = item.getAttribute("id")
      const href = item.getAttribute("href")
      if (id && href) {
        manifest[id] = href
        // EPUB 3 nav documents have properties="nav"; also skip by common nav filenames
        // for generators that omit the properties attribute.
        const isNav =
          (item.getAttribute("properties") ?? "").includes("nav") ||
          /(?:^|\/)(?:nav|toc)\.x?html$/i.test(href)
        if (isNav) navIds.add(id)
      }
    })

  const spinePaths: string[] = []
  allOpfEls
    .filter((el) => el.localName === "itemref")
    .forEach((itemref) => {
      const idref = itemref.getAttribute("idref")
      if (!idref) return
      if (navIds.has(idref)) return
      const href = manifest[idref]
      if (!href) return
      if (!href.endsWith(".xhtml") && !href.endsWith(".html")) return
      const fullPath = opfDir ? `${opfDir}/${href}` : href
      spinePaths.push(fullPath)
    })

  return spinePaths
}

/**
 * Extract structured paragraph content (text + inline images) from an EPUB.
 *
 * Returns one SourceParagraph per block element, preserving reading order.
 * Strips furigana (<rt> tags) before extracting text.
 * Only call from browser / Web Worker context.
 */
export async function extractEpubContent(
  blob: Blob
): Promise<SourceParagraph[]> {
  // ParallelTexts-exported EPUBs carry their source paragraphs in a manifest;
  // return those directly so only source text is used (no target leakage).
  const ptParas = await extractPtEpubSourceParagraphs(blob)
  if (ptParas !== null) return ptParas

  const zip = await JSZip.loadAsync(blob)
  const spinePaths = await getSpinePaths(zip)
  const paragraphs: SourceParagraph[] = []
  let paraIdx = 0

  for (const xhtmlPath of spinePaths) {
    const html = await zip.file(xhtmlPath)?.async("string")
    if (!html) continue

    const blocks = await parseXhtmlBlocks(html, xhtmlPath, zip)
    for (const block of blocks) {
      paragraphs.push({
        para_idx: paraIdx++,
        text: block.text,
        images: block.images,
      })
    }
  }

  return paragraphs
}

// ---------------------------------------------------------------------------
// Legacy: flat text extraction (kept for backward compatibility)
// ---------------------------------------------------------------------------

/** Extract text from a document, preserving paragraph structure. */
function extractTextWithParagraphs(doc: Document): string {
  const blocks: Array<string> = []
  const paras = doc.querySelectorAll("p")

  if (paras.length > 0) {
    for (const p of paras) {
      const t = p.textContent?.trim()
      if (t) blocks.push(t)
    }
  }

  if (blocks.length === 0) {
    const bodyText = doc.body?.textContent?.trim()
    if (bodyText) blocks.push(bodyText)
  }

  return blocks.join("\n\n")
}

/** Extract flat text from all spine sections of an EPUB. */
export async function extractEpubText(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer()
  const book = ePub(arrayBuffer as unknown as string, { encoding: "binary" })

  await book.ready

  const texts: Array<string> = []
  let i = 0

  while (true) {
    const section = book.spine.get(i)
    if (!section || !section.href) break
    try {
      const doc = (await book.load(section.href)) as Document | undefined
      if (!doc) continue
      const text = extractTextWithParagraphs(doc)
      if (text) texts.push(text)
    } catch {
      // Skip sections that fail to load
    }
    i++
  }

  return texts.join("\n\n")
}
