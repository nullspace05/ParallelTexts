import type { AlignmentType } from "@/types/alignment"

export interface TsvRow {
  src: string
  tgt: string
  confidence: number | null
  alignmentType: AlignmentType
}

export interface TsvParseResult {
  rows: TsvRow[]
  /** True when at least one row has a numeric confidence score. */
  hasConfidence: boolean
  /** True when the file contains `# exported_by=ParallelTexts`. */
  fromParallelTexts: boolean
  srcTitle: string
  tgtTitle: string
  srcLang: string
  tgtLang: string
  /** Fatal errors that prevent import. */
  errors: string[]
  /** Non-fatal issues (rows skipped, values coerced). */
  warnings: string[]
}

export function parseTsv(raw: string): TsvParseResult {
  const result: TsvParseResult = {
    rows: [],
    hasConfidence: false,
    fromParallelTexts: false,
    srcTitle: "",
    tgtTitle: "",
    srcLang: "",
    tgtLang: "",
    errors: [],
    warnings: [],
  }

  // Strip BOM (U+FEFF)
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  const lines = text.split(/\r?\n/)

  let colCount: 2 | 3 | null = null
  let headerSkipped = false

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i]

    if (!line.trim()) continue

    // ── Comment / metadata lines ───────────────────────────────────────────
    if (line.startsWith("#")) {
      const meta = line.slice(1).trim()

      if (meta.startsWith("exported_by=ParallelTexts")) {
        result.fromParallelTexts = true
      } else if (meta.startsWith("source_title=")) {
        result.srcTitle = meta.slice("source_title=".length).trim()
      } else if (meta.startsWith("target_title=")) {
        result.tgtTitle = meta.slice("target_title=".length).trim()
      } else if (meta.startsWith("src_lang=")) {
        // New format: "src_lang=en" — or old format: "src_lang=en\ttgt_lang=ja"
        const rest = meta.slice("src_lang=".length)
        const langParts = rest.split(/\s+/)
        result.srcLang = langParts[0]
        // Old single-line format: also extract tgt_lang if present
        if (langParts.length > 1 && !result.tgtLang) {
          const tgtMatch = /tgt_lang=(\S+)/.exec(rest)
          if (tgtMatch) result.tgtLang = tgtMatch[1]
        }
      } else if (meta.startsWith("tgt_lang=")) {
        result.tgtLang = meta.slice("tgt_lang=".length).trim()
      } else {
        // Old export format: "# Title1 ↔ Title2"
        if (!result.srcTitle && meta.includes("↔") && !meta.includes("=")) {
          const parts = meta.split("↔")
          result.srcTitle = parts[0].trim()
          result.tgtTitle = (parts[1] ?? "").trim()
        }
      }
      continue
    }

    const cols = line.split("\t")

    // ── Header row detection ───────────────────────────────────────────────
    if (!headerSkipped && cols[0].toLowerCase() === "source_text") {
      headerSkipped = true
      colCount = cols.length >= 3 ? 3 : 2
      continue
    }

    // ── Determine column count from first data row ─────────────────────────
    if (colCount === null) {
      if (cols.length === 2) {
        colCount = 2
      } else if (cols.length === 3) {
        colCount = 3
      } else {
        result.errors.push(
          `Row ${lineNum}: expected 2 or 3 tab-separated columns, got ${cols.length}. ` +
            `Make sure the file uses tabs (not spaces) as separators.`
        )
        return result
      }
    }

    // ── Validate column count for this row ─────────────────────────────────
    if (cols.length !== 2 && cols.length !== 3) {
      result.warnings.push(
        `Row ${lineNum}: expected ${colCount} columns, got ${cols.length} — skipped.`
      )
      continue
    }

    const src = cols[0].trim()
    const tgt = cols[1].trim()

    // Both empty — nothing to import
    if (!src && !tgt) {
      result.warnings.push(`Row ${lineNum}: both columns are empty — skipped.`)
      continue
    }

    // Determine alignment type from which side is populated
    const alignmentType: AlignmentType = !src ? "0:1" : !tgt ? "1:0" : "1:1"

    let confidence: number | null = null
    if (alignmentType === "1:1" && cols.length === 3 && cols[2].trim() !== "") {
      const parsed = parseFloat(cols[2].trim())
      if (isNaN(parsed) || parsed < 0 || parsed > 1) {
        result.warnings.push(
          `Row ${lineNum}: confidence "${cols[2].trim()}" is not a valid score (0–1) — set to null.`
        )
      } else {
        confidence = parsed
      }
    }

    result.rows.push({ src, tgt, confidence, alignmentType })
  }

  if (result.rows.length === 0 && result.errors.length === 0) {
    result.errors.push(
      "No valid data rows found. " +
        "Check that the file has at least one non-comment row with tab-separated columns."
    )
    return result
  }

  // Confidence is "present" if at least one 1:1 row has a numeric score
  result.hasConfidence = result.rows.some(
    (r) => r.alignmentType === "1:1" && r.confidence !== null
  )

  return result
}
