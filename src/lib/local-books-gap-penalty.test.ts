// @vitest-environment node
//
// Real-embedding regression test for the gapPenalty fix (see
// DEFAULT_GAP_PENALTY in user-settings.ts). At gapPenalty=0, a gap is
// free, so any weakly-positive similarity match "steals" a real sentence
// instead of correctly falling back to a gap — this is what caused a user
// report where a book's real first sentence got glued to a 2-character
// Japanese "目次" (Table of Contents) heading at 0.27 confidence, bumping
// the whole opening paragraph off by one sentence.
//
// Runs the real embedding model (not synthetic vectors) against the
// beginning and end of each book already sitting in the git-ignored books/
// directory — the beginning/end are where front matter, credits, and
// colophon pages live, i.e. exactly where sentences have no real
// counterpart on the other side. Uses `@vitest-environment node` (not
// jsdom) because transformers.js's ONNX runtime chokes on jsdom's
// cross-realm Float32Array; parsePtEpub doesn't need DOMParser so plain
// Node is fine here.
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
// Enough sentences to comfortably span real front-matter/colophon content
// plus real narrative, without embedding an entire book on CPU.
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

/**
 * A 1:1 match where one side is a short fragment (likely a heading, credit
 * line, or other boilerplate) matched against a much longer, unrelated
 * side, at low confidence, is the signature of a junk line stealing a real
 * sentence instead of being left as a gap.
 */
function isJunkSteal(p: {
  alignment_type: string
  confidence: number | null
  src_text: string
  tgt_text: string
}): boolean {
  if (p.alignment_type !== "1:1" || p.confidence === null) return false
  const shorter = Math.min(p.src_text.length, p.tgt_text.length)
  const longer = Math.max(p.src_text.length, p.tgt_text.length)
  return p.confidence < 0.5 && shorter < 15 && longer > 40
}

describe.skipIf(epubPaths.length === 0)(
  "gapPenalty fix: junk/front-matter lines don't steal real sentences",
  () => {
    for (const path of epubPaths) {
      const label = path.split("/").pop()!

      it(
        `${label}: beginning and end of the book align decently with real embeddings`,
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

            const steals = pairs.filter(isJunkSteal)
            if (steals.length > 0) {
              console.log(
                `[${label}/${where}] junk-steal violations:`,
                JSON.stringify(
                  steals.map((p) => ({
                    conf: p.confidence,
                    src: p.src_text.slice(0, 40),
                    tgt: p.tgt_text.slice(0, 60),
                  })),
                  null,
                  2
                )
              )
            }
            expect(
              steals,
              `${label}/${where}: short fragment glued to unrelated long sentence at low confidence`
            ).toEqual([])

            // Loose sanity floor, not a quality bar: a handful of windows
            // (e.g. Alice ja-en's ending, where the English side is Project
            // Gutenberg's legal boilerplate and the Japanese side is an
            // unrelated Aozora Bunko CC-license notice) legitimately have
            // almost nothing in common between the two languages, so no
            // fixed "should mostly match" ratio holds across every window.
            // This only guards against the fix collapsing to all-gaps.
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
