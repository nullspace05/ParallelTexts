import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { buildAlignmentParagraphs } from "@/lib/alignment-paragraphs"
import { parsePtEpub } from "@/lib/pt-epub"

/**
 * Local-only regression test: verifies that every sentence produced by the
 * alignment pipeline is actually reachable in the reader's paragraph list.
 *
 * Runs against the real `*_align.epub` exports already sitting in the
 * git-ignored `books/` directory (see .gitignore) — including
 * `books/debugging/`, which holds the exact book pair from a user-reported
 * bug where the English book's first sentence disappeared from the reader.
 * There's nothing to run this against in CI/on a fresh checkout, so the
 * whole suite skips itself when `books/` isn't present.
 */

const BOOKS_ROOT = join(__dirname, "../../books")

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
  "local sample books: no sentence text should disappear from the reader",
  () => {
    for (const path of epubPaths) {
      it(`every non-empty source/target sentence in ${path.split("/").pop()} is reachable via buildAlignmentParagraphs`, async () => {
        const blob = new Blob([readFileSync(path)])
        const record = await parsePtEpub(blob)
        // Not every EPUB under books/ is a ParallelTexts export (e.g. plain
        // source novels used as align-form input) — only check the ones that are.
        if (!record) return

        const { result } = record
        const paragraphs = buildAlignmentParagraphs(result, "both")

        const shownSrcTexts = new Set<string>()
        const shownTgtTexts = new Set<string>()
        for (const p of paragraphs) {
          for (const pr of p.pairs) {
            if (pr.src_text) shownSrcTexts.add(pr.src_text)
            if (pr.tgt_text) shownTgtTexts.add(pr.tgt_text)
          }
        }

        const missingSrc = result.pairs
          .filter((p) => p.src_text && !shownSrcTexts.has(p.src_text))
          .map((p) => p.src_text)
        const missingTgt = result.pairs
          .filter((p) => p.tgt_text && !shownTgtTexts.has(p.tgt_text))
          .map((p) => p.tgt_text)

        if (missingSrc.length > 0 || missingTgt.length > 0) {
          console.log(
            `[${path}] missing source sentences: ${missingSrc.length}, ` +
              `missing target sentences: ${missingTgt.length}\n` +
              `first missing target examples: ${JSON.stringify(missingTgt.slice(0, 5))}`
          )
        }

        expect(missingSrc, "source sentences dropped from the reader").toEqual(
          []
        )
        expect(missingTgt, "target sentences dropped from the reader").toEqual(
          []
        )
      })
    }
  }
)
