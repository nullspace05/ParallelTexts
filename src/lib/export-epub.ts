import JSZip from "jszip"
import type { ImageMode } from "@/lib/user-settings"
import { buildPtManifest, PT_MANIFEST_PATH } from "@/lib/pt-epub"
import type {
  AlignedPair,
  AlignmentRecord,
  ImageAsset,
} from "@/types/alignment"

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, "_")
      .trim()
      .slice(0, 80) || "alignment"
  )
}

function shortTitle(name: string, maxChars = 14): string {
  const s = sanitizeFilename(name)
  if (s.length <= maxChars) return s
  const cut = s.slice(0, maxChars).trimEnd()
  const lastSpace = cut.lastIndexOf(" ")
  return lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut
}

function imageEpubFilename(img: ImageAsset): string {
  // Replace any non-safe characters; keep extension
  return "src_" + img.id.replace(/[^a-zA-Z0-9._-]/g, "_")
}

// ── Display paragraph builder (mirrors viewer logic) ──────────────────────────

interface DisplayPara {
  pairs: AlignedPair[]
  images: ImageAsset[]
}

function pickImages(
  srcImgs: ImageAsset[],
  tgtImgs: ImageAsset[],
  mode: ImageMode
): ImageAsset[] {
  if (mode === "none") return []
  if (mode === "source") return srcImgs
  if (mode === "target") return tgtImgs
  return [...srcImgs, ...tgtImgs]
}

function buildDisplayParas(
  record: AlignmentRecord,
  imageMode: ImageMode
): DisplayPara[] {
  const {
    pairs,
    source_paragraphs: srcParas = [],
    target_paragraphs: tgtParas = [],
  } = record.result

  const grouped = new Map<number, AlignedPair[]>()
  for (const pair of pairs) {
    const idx = pair.src_para_idx ?? 0
    if (!grouped.has(idx)) grouped.set(idx, [])
    grouped.get(idx)!.push(pair)
  }

  if (srcParas.length > 0) {
    const filtered = srcParas.filter(
      (sp) => sp.text.trim() || sp.images.length > 0
    )

    // Map tgt_para_idx → display index via pairs
    const tgtParaToDisplay = new Map<number, number>()
    filtered.forEach((sp, displayIdx) => {
      for (const pair of grouped.get(sp.para_idx) ?? []) {
        if (
          pair.tgt_para_idx !== null &&
          !tgtParaToDisplay.has(pair.tgt_para_idx)
        ) {
          tgtParaToDisplay.set(pair.tgt_para_idx, displayIdx)
        }
      }
    })

    // Assign image-only target paragraphs to display slots via nearest-following
    const sortedKnownTgt = [...tgtParaToDisplay.keys()].sort((a, b) => a - b)
    const displayIdxToTgtImgs = new Map<number, ImageAsset[]>()
    for (const tp of tgtParas) {
      if (tp.images.length === 0) continue
      let displayIdx: number
      if (tgtParaToDisplay.has(tp.para_idx)) {
        displayIdx = tgtParaToDisplay.get(tp.para_idx)!
      } else {
        let lo = 0,
          hi = sortedKnownTgt.length - 1,
          nextKnown = -1
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (sortedKnownTgt[mid] > tp.para_idx) {
            nextKnown = sortedKnownTgt[mid]
            hi = mid - 1
          } else {
            lo = mid + 1
          }
        }
        displayIdx =
          nextKnown >= 0
            ? tgtParaToDisplay.get(nextKnown)!
            : filtered.length - 1
      }
      const prev = displayIdxToTgtImgs.get(displayIdx) ?? []
      displayIdxToTgtImgs.set(displayIdx, [...prev, ...tp.images])
    }

    return filtered
      .map((sp, displayIdx) => ({
        pairs: (grouped.get(sp.para_idx) ?? []).filter(
          (p) => p.src_text.trim() || p.tgt_text.trim()
        ),
        images: pickImages(
          sp.images,
          displayIdxToTgtImgs.get(displayIdx) ?? [],
          imageMode
        ),
      }))
      .filter((dp) => dp.pairs.length > 0 || dp.images.length > 0)
  }

  // Fallback: legacy records without source_paragraphs
  const tgtImagesByIdx = new Map<number, ImageAsset[]>()
  for (const tp of tgtParas) {
    if (tp.images.length > 0) tgtImagesByIdx.set(tp.para_idx, tp.images)
  }

  return Array.from(grouped.keys())
    .sort((a, b) => a - b)
    .map((idx) => {
      const ps = grouped.get(idx)!
      const srcImgs = ps.find((p) => p.src_images?.length)?.src_images ?? []
      const tgtIdxSet = new Set(
        ps.map((p) => p.tgt_para_idx).filter((n): n is number => n !== null)
      )
      const tgtImgs = [...tgtIdxSet].flatMap((i) => tgtImagesByIdx.get(i) ?? [])
      return {
        pairs: ps.filter((p) => p.src_text.trim() || p.tgt_text.trim()),
        images: pickImages(srcImgs, tgtImgs, imageMode),
      }
    })
    .filter((dp) => dp.pairs.length > 0 || dp.images.length > 0)
}

// ── XHTML templates ───────────────────────────────────────────────────────────

function chapterXhtml(
  title: string,
  paras: DisplayPara[],
  imgFilenameMap: Map<string, string>,
  srcLang: string,
  tgtLang: string
): string {
  const body = paras
    .map((dp) => {
      const imgs = dp.images
        .map((img) => {
          const fname = imgFilenameMap.get(img.id)
          return fname
            ? `    <img src="images/${fname}" alt="" class="illus"/>`
            : ""
        })
        .filter(Boolean)
        .join("\n")

      const pairBlocks = dp.pairs
        .map((p) => {
          if (p.alignment_type === "1:0") {
            return `    <div class="pair gap">
      <p class="src" xml:lang="${srcLang}">${esc(p.src_text)}</p>
    </div>`
          }
          if (p.alignment_type === "0:1") {
            return `    <details class="pair">
      <summary class="tgt-gap">···</summary>
      <p class="tgt" xml:lang="${tgtLang}">${esc(p.tgt_text)}</p>
    </details>`
          }
          return `    <details class="pair">
      <summary class="src" xml:lang="${srcLang}">${esc(p.src_text)}</summary>
      <p class="tgt" xml:lang="${tgtLang}">${esc(p.tgt_text)}</p>
    </details>`
        })
        .join("\n")

      return `  <div class="para">\n${imgs ? imgs + "\n" : ""}${pairBlocks}\n  </div>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${srcLang}">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body epub:type="bodymatter chapter">
  <h1 class="ch-title">${esc(title)}</h1>
${body}
</body>
</html>`
}

const CSS = `body {
  font-family: serif;
  line-height: 1.7;
  margin: 0 auto;
  max-width: 38em;
  padding: 1em 1em 4em;
}
h1 {
  text-align: center;
  font-size: 1.1em;
  margin: 0 0 2em;
}
.ch-title {
  font-size: 1em;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: rgba(0,0,0,.45);
}
.para {
  margin: 0 0 1.8em;
}
.pair { margin: 0 0 .5em; }
details.pair > summary {
  list-style: none;
  cursor: pointer;
  margin: 0;
  text-decoration: underline dotted rgba(0,0,0,.18);
  text-underline-offset: .2em;
}
details.pair > summary::-webkit-details-marker { display: none; }
details.pair > summary::marker { display: none; }
.tgt-gap {
  color: rgba(0,0,0,.25);
  font-size: .8em;
  letter-spacing: .1em;
  text-decoration: none;
}
.src { margin: 0; }
.tgt {
  margin: .2em 0 0 .8em;
  padding-left: .65em;
  border-left: 2px solid rgba(0,0,0,.14);
  color: rgba(0,0,0,.55);
  font-style: italic;
}
.illus {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1em auto;
}
`

// ── Main export function ───────────────────────────────────────────────────────

export async function buildAlignmentEpubBlob(
  record: AlignmentRecord,
  imageMode: ImageMode = "source"
): Promise<{ blob: Blob; filename: string }> {
  const { src_lang, tgt_lang } = record.result
  const bookTitle = `${record.sourceBookTitle} ↔ ${record.targetBookTitle}`
  const uid = `urn:uuid:${crypto.randomUUID()}`
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")

  const displayParas = buildDisplayParas(record, imageMode)

  // Collect ALL images from the record for ZIP storage and the PT manifest.
  // This ensures a perfect roundtrip even when imageMode hides some images.
  const allImgFilenameMap = new Map<string, string>() // img.id → epub filename
  const allImgMimeMap = new Map<string, string>() // epub filename → mime
  const allImgDataMap = new Map<string, string>() // epub filename → base64

  function registerImage(img: ImageAsset) {
    if (allImgFilenameMap.has(img.id)) return
    const fname = imageEpubFilename(img)
    allImgFilenameMap.set(img.id, fname)
    allImgMimeMap.set(fname, img.mime_type)
    allImgDataMap.set(fname, img.data_base64)
  }

  for (const sp of record.result.source_paragraphs ?? [])
    sp.images.forEach(registerImage)
  for (const sp of record.result.target_paragraphs ?? [])
    sp.images.forEach(registerImage)
  for (const p of record.result.pairs) {
    ;(p.src_images ?? []).forEach(registerImage)
    ;(p.tgt_images ?? []).forEach(registerImage)
  }

  // Split into chapters (at most 20; each at least 50 display paragraphs)
  const chunkSize = Math.max(50, Math.ceil(displayParas.length / 20))
  const chunks: DisplayPara[][] = []
  for (let i = 0; i < displayParas.length; i += chunkSize) {
    chunks.push(displayParas.slice(i, i + chunkSize))
  }
  if (chunks.length === 0) chunks.push([])

  const chFileIds = chunks.map((_, i) => `ch${String(i + 1).padStart(3, "0")}`)
  const chFilenames = chFileIds.map((id) => `${id}.xhtml`)
  const chTitles = chunks.map((_, i) =>
    chunks.length === 1 ? bookTitle : `Part ${i + 1} of ${chunks.length}`
  )

  // ── Build ZIP ──────────────────────────────────────────────────────────────

  const zip = new JSZip()

  // mimetype MUST be first and uncompressed (EPUB spec §3.2)
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" })

  // META-INF/container.xml
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0"
           xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf"
              media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )

  // Stylesheet
  zip.file("EPUB/styles.css", CSS)

  // PT manifest — must be added before content so import can find it without
  // needing the OPF; it lives at the ZIP root, outside the EPUB/ folder.
  zip.file(
    PT_MANIFEST_PATH,
    JSON.stringify(buildPtManifest(record, allImgFilenameMap, allImgMimeMap))
  )

  // Chapter content files
  for (let i = 0; i < chunks.length; i++) {
    zip.file(
      `EPUB/${chFilenames[i]}`,
      chapterXhtml(
        chTitles[i],
        chunks[i],
        allImgFilenameMap,
        src_lang,
        tgt_lang
      )
    )
  }

  // All images (superset of what's displayed — needed for full roundtrip)
  for (const [fname, b64] of allImgDataMap) {
    zip.file(`EPUB/images/${fname}`, b64, { base64: true })
  }

  // nav.xhtml (required EPUB 3 navigation document)
  const tocItems = chFilenames
    .map((f, i) => `      <li><a href="${f}">${esc(chTitles[i])}</a></li>`)
    .join("\n")

  zip.file(
    "EPUB/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${src_lang}">
<head>
  <meta charset="UTF-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
${tocItems}
    </ol>
  </nav>
</body>
</html>`
  )

  // content.opf — package document
  const manifestItems = [
    `    <item id="nav" href="nav.xhtml"
          media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="css" href="styles.css" media-type="text/css"/>`,
    ...chFileIds.map(
      (id, i) =>
        `    <item id="${id}" href="${chFilenames[i]}" media-type="application/xhtml+xml"/>`
    ),
    ...[...allImgMimeMap.entries()].map(
      ([fname, mime], i) =>
        `    <item id="img${i}" href="images/${fname}" media-type="${mime}"/>`
    ),
  ].join("\n")

  const spineItems = [
    `    <itemref idref="nav" linear="no"/>`,
    ...chFileIds.map((id) => `    <itemref idref="${id}"/>`),
  ].join("\n")

  zip.file(
    "EPUB/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         version="3.0"
         xml:lang="${src_lang}"
         unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${esc(bookTitle)}</dc:title>
    <dc:language>${src_lang}</dc:language>
    <dc:language>${tgt_lang}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`
  )

  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  return {
    blob,
    filename: `${shortTitle(record.sourceBookTitle)}_${shortTitle(record.targetBookTitle)}_${record.result.src_lang}-${record.result.tgt_lang}_align.epub`,
  }
}

export async function downloadAlignmentEpub(
  record: AlignmentRecord,
  imageMode: ImageMode = "source"
): Promise<void> {
  const { blob, filename } = await buildAlignmentEpubBlob(record, imageMode)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
