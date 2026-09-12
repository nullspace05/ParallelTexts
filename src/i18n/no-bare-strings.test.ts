import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

// Guards against new hardcoded, untranslated UI copy creeping into
// src/routes and src/components. It is intentionally narrow: it only
// flags JSX text nodes and aria-label/title/placeholder/alt string
// literals that contain a letter, and it allowlists the handful of
// brand names, acronyms, and technical tokens that are deliberately
// left untranslated (see .docs/feature_plans/09_ui_language_english_japanese.md).

const SCAN_ROOTS = ["src/routes", "src/components"]

const TRANSLATABLE_ATTRIBUTES = new Set([
  "aria-label",
  "title",
  "placeholder",
  "alt",
])

// Exact-match literals that are intentionally not routed through t()/Trans:
// brand name, file/format tokens, hardware/runtime labels, license id, and
// other content explicitly excluded by the plan (book/alignment data,
// technical identifiers).
const ALLOWLIST = new Set([
  "ParallelTexts",
  "GitHub",
  "GPL-3.0",
  "EPUB",
  "PDF",
  "TXT",
  "TSV",
  "GPU",
  "CPU",
  "WASM",
  "WebGPU",
  "English",
  "日本語",
  // Unit abbreviation, not sentence copy.
  "MB",
  "MB)",
  // File-extension/format listing, not prose.
  ".epub (ParallelTexts) · .tsv · .txt",
  // Font-size live preview in settings: fixed demo sentences shown in both
  // scripts to illustrate the reader font at the chosen size, independent
  // of the interface language.
  "Ancient temples in Kyoto.",
  "京都の古い寺院た。",
])

// Files that intentionally hold no translatable UI copy of their own, or
// are dev-only tooling never shown to end users.
const FILE_ALLOWLIST = new Set(["src/components/dev-embedding-controls.tsx"])

function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectTsxFiles(full, out)
    } else if (
      entry.endsWith(".tsx") &&
      !entry.endsWith(".test.tsx") &&
      !FILE_ALLOWLIST.has(full)
    ) {
      out.push(full)
    }
  }
  return out
}

// A letter in any script — catches English prose as well as any
// stray Japanese/other literal that should instead live in the catalog.
const HAS_LETTER = /\p{L}/u

function isBareUserFacingText(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (ALLOWLIST.has(trimmed)) return false
  return HAS_LETTER.test(trimmed)
}

interface Violation {
  file: string
  line: number
  text: string
}

function scanFile(file: string): Violation[] {
  const text = readFileSync(file, "utf-8")
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const violations: Violation[] = []

  function report(node: ts.Node, value: string) {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart())
    violations.push({ file, line: line + 1, text: value.trim() })
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && isBareUserFacingText(node.text)) {
      report(node, node.text)
    }

    if (
      ts.isJsxAttribute(node) &&
      TRANSLATABLE_ATTRIBUTES.has(node.name.getText()) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      isBareUserFacingText(node.initializer.text)
    ) {
      report(node.initializer, node.initializer.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return violations
}

describe("no bare UI strings", () => {
  it("routes every user-facing string in src/routes and src/components through the i18n catalog", () => {
    const files = SCAN_ROOTS.flatMap((root) => collectTsxFiles(root))
    const violations = files.flatMap(scanFile)

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} — "${v.text}"`)
        .join("\n")
      throw new Error(
        `Found ${violations.length} bare UI string(s) not routed through t()/<Trans>:\n${report}\n\n` +
          `Wrap these in useTranslation()'s t() (or <Trans>) and add matching keys to ` +
          `src/i18n/en.json and src/i18n/ja.json. If a string is intentionally exempt ` +
          `(brand name, technical token, book/alignment content), add it to the ` +
          `allowlist in src/i18n/no-bare-strings.test.ts with a comment explaining why.`
      )
    }

    expect(violations).toEqual([])
  })
})
