import JSZip from "jszip"

import type {
  AlignmentRecord,
  ImageAsset,
  SourceParagraph,
} from "@/types/alignment"

export const PT_MANIFEST_PATH = "pt-manifest.json"

export interface PtImageRef {
  id: string
  mime_type: string
  epub_filename: string
}

export interface PtManifest {
  exported_by: "ParallelTexts"
  version: 1
  record: AlignmentRecord
  image_refs: PtImageRef[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripBase64(assets: ImageAsset[]): ImageAsset[] {
  return assets.map((a) => ({ ...a, data_base64: "" }))
}

function fillBase64(
  assets: ImageAsset[],
  idToBase64: Map<string, string>
): ImageAsset[] {
  return assets.map((a) => ({
    ...a,
    data_base64: idToBase64.get(a.id) ?? a.data_base64,
  }))
}

async function loadImagesFromZip(
  zip: JSZip,
  refs: PtImageRef[]
): Promise<Map<string, string>> {
  const idToBase64 = new Map<string, string>()
  await Promise.all(
    refs.map(async (ref) => {
      const file = zip.file(`EPUB/images/${ref.epub_filename}`)
      if (file) idToBase64.set(ref.id, await file.async("base64"))
    })
  )
  return idToBase64
}

// ── Build (called during export) ──────────────────────────────────────────────

/**
 * Produces the manifest object to embed in the EPUB as pt-manifest.json.
 * All image data_base64 fields are stripped to "" — the actual bytes live in
 * EPUB/images/ and are referenced via image_refs.
 */
export function buildPtManifest(
  record: AlignmentRecord,
  imgFilenameMap: Map<string, string>,
  imgMimeMap: Map<string, string>
): PtManifest {
  const image_refs: PtImageRef[] = []
  for (const [id, epub_filename] of imgFilenameMap) {
    image_refs.push({
      id,
      mime_type: imgMimeMap.get(epub_filename) ?? "application/octet-stream",
      epub_filename,
    })
  }

  const strippedRecord: AlignmentRecord = {
    ...record,
    result: {
      ...record.result,
      source_paragraphs: record.result.source_paragraphs?.map((sp) => ({
        ...sp,
        images: stripBase64(sp.images),
      })),
      target_paragraphs: record.result.target_paragraphs?.map((sp) => ({
        ...sp,
        images: stripBase64(sp.images),
      })),
      pairs: record.result.pairs.map((p) => ({
        ...p,
        src_images: p.src_images ? stripBase64(p.src_images) : null,
        tgt_images: p.tgt_images ? stripBase64(p.tgt_images) : null,
      })),
    },
  }

  return {
    exported_by: "ParallelTexts",
    version: 1,
    record: strippedRecord,
    image_refs,
  }
}

// ── Parse (called during import) ─────────────────────────────────────────────

async function openPtManifest(
  blob: Blob
): Promise<{ zip: JSZip; manifest: PtManifest } | null> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(blob)
  } catch {
    return null
  }
  const manifestFile = zip.file(PT_MANIFEST_PATH)
  if (!manifestFile) return null
  let manifest: PtManifest
  try {
    manifest = JSON.parse(await manifestFile.async("string"))
  } catch {
    return null
  }
  if (manifest.exported_by !== "ParallelTexts" || manifest.version !== 1)
    return null
  return { zip, manifest }
}

/**
 * Parses a ParallelTexts-exported EPUB and returns the full AlignmentRecord
 * with all images reconstructed from the ZIP. Returns null for non-PT EPUBs.
 */
export async function parsePtEpub(blob: Blob): Promise<AlignmentRecord | null> {
  const result = await openPtManifest(blob)
  if (!result) return null
  const { zip, manifest } = result

  const idToBase64 = await loadImagesFromZip(zip, manifest.image_refs)
  const rec = manifest.record

  return {
    ...rec,
    result: {
      ...rec.result,
      source_paragraphs: rec.result.source_paragraphs?.map((sp) => ({
        ...sp,
        images: fillBase64(sp.images, idToBase64),
      })),
      target_paragraphs: rec.result.target_paragraphs?.map((sp) => ({
        ...sp,
        images: fillBase64(sp.images, idToBase64),
      })),
      pairs: rec.result.pairs.map((p) => ({
        ...p,
        src_images: p.src_images ? fillBase64(p.src_images, idToBase64) : null,
        tgt_images: p.tgt_images ? fillBase64(p.tgt_images, idToBase64) : null,
      })),
    },
  }
}

/**
 * For book import: returns only source paragraphs from a PT EPUB.
 * Returns null for non-PT EPUBs (caller should fall through to normal extraction).
 */
export async function extractPtEpubSourceParagraphs(
  blob: Blob
): Promise<SourceParagraph[] | null> {
  const result = await openPtManifest(blob)
  if (!result) return null
  const { zip, manifest } = result

  const sourceParas = manifest.record.result.source_paragraphs
  if (!sourceParas || sourceParas.length === 0) return null

  const idToBase64 = await loadImagesFromZip(zip, manifest.image_refs)

  return sourceParas.map((sp) => ({
    ...sp,
    images: fillBase64(sp.images, idToBase64),
  }))
}
