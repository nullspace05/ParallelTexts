// @vitest-environment node
//
// Local-only smoke test: run real embeddings + banded NW on the start and
// end of each ParallelTexts export sitting in the git-ignored books/
// directory, and assert the alignment isn't completely broken (at least
// one high-confidence 1:1 match per window).
//
// This is not a quality bar for front matter / TOC / credits. Those
// unmatched extras are handled by paragraph exclusions, not by raising
// DEFAULT_GAP_PENALTY (which is 0 by design). Uses
// `@vitest-environment node` (not jsdom) because transformers.js's ONNX
// runtime chokes on jsdom's cross-realm Float32Array; we read the
// manifest via JSZip + ArrayBuffer so DOMParser isn't needed.
//
// Skips itself when books/ isn't present, same as
// local-books-text-coverage.test.ts.

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"
import { describe, expect, it } from "vitest"

import { embedSentences } from "@/lib/alignment-pipeline"
import { bandedNWAlign } from "@/lib/banded-nw"
import { PT_MANIFEST_PATH, type PtManifest } from "@/lib/pt-epub"
import { splitIntoSentences } from "@/lib/sentence-splitter"
import { DEFAULT_GAP_PENALTY } from "@/lib/user-settings"

/**
 * Lightweight stand-in for parsePtEpub() that works under plain Node: JSZip
 * doesn't recognize Node's native Blob as blob-like (only works via jsdom's
 * Blob polyfill, or a raw ArrayBuffer), so we read the zip via ArrayBuffer
 * directly. We only need the plain-text paragraph fields here, not
 * parsePtEpub's base64 image reconstruction.
 */
async function readPtManifestResult(path: string) {
  const buf = readFileSync(path)
  const zip = await JSZip.loadAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  )
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
  return manifest.record.result
}

const BOOKS_ROOT = join(__dirname, "../../books")
const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
// Enough sentences to sample real narrative without embedding an entire
// book on CPU.
const WINDOW = 100

function findAlignEpubs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...findAlignEpubs(full))
    else if (entry.isFile() && entry.name.endsWith(".epub")) out.push(full)
  }
  return out
}

const epubPaths = findAlignEpubs(BOOKS_ROOT)

describe.skipIf(epubPaths.length === 0)(
  "local sample books: alignment smoke test with real embeddings",
  () => {
    for (const path of epubPaths) {
      const label = path.split("/").pop()!

      it(
        `${label}: beginning and end of the book produce at least one high-confidence match`,
        async () => {
          const result = await readPtManifestResult(path)
          // Not every EPUB under books/ is a ParallelTexts export.
          if (!result) return

          const srcParas = result.source_paragraphs ?? []
          const tgtParas = result.target_paragraphs ?? []
          if (srcParas.length === 0 || tgtParas.length === 0) return

          const { records: srcAll } = splitIntoSentences(
            srcParas,
            result.src_lang,
            100_000
          )
          const { records: tgtAll } = splitIntoSentences(
            tgtParas,
            result.tgt_lang,
            100_000
          )

          const windows = {
            start: {
              src: srcAll.slice(0, WINDOW),
              tgt: tgtAll.slice(0, WINDOW),
            },
            end: {
              src: srcAll.slice(-WINDOW),
              tgt: tgtAll.slice(-WINDOW),
            },
          }

          for (const [where, { src, tgt }] of Object.entries(windows)) {
            if (src.length === 0 || tgt.length === 0) continue

            const [srcEmbRes, tgtEmbRes] = await Promise.all([
              embedSentences(
                src.map((r) => r.text),
                MODEL_ID,
                "wasm"
              ),
              embedSentences(
                tgt.map((r) => r.text),
                MODEL_ID,
                "wasm"
              ),
            ])

            const pairs = bandedNWAlign(
              srcEmbRes.data,
              tgtEmbRes.data,
              srcEmbRes.hiddenDim,
              src,
              tgt,
              DEFAULT_GAP_PENALTY,
              0.15
            )

            // Loose sanity floor, not a quality bar: a handful of windows
            // (e.g. Alice ja-en's ending, where the English side is Project
            // Gutenberg's legal boilerplate and the Japanese side is an
            // unrelated Aozora Bunko CC-license notice) legitimately have
            // almost nothing in common between the two languages, so no
            // fixed "should mostly match" ratio holds across every window.
            // This only guards against alignment collapsing to all-gaps.
            const highConfMatches = pairs.filter(
              (p) => p.alignment_type === "1:1" && (p.confidence ?? 0) > 0.6
            ).length
            const ratio = highConfMatches / Math.min(src.length, tgt.length)
            console.log(
              `[${label}/${where}] high-confidence 1:1 ratio: ${ratio.toFixed(2)} (${highConfMatches}/${Math.min(src.length, tgt.length)})`
            )
            expect(
              highConfMatches,
              `${label}/${where}: zero high-confidence matches — alignment looks completely broken`
            ).toBeGreaterThan(0)
          }
        },
        5 * 60_000
      )
    }
  }
)
