import type { AlignmentRecord } from "@/types/alignment"

/**
 * Export the full aligned corpus as a tab-separated file and trigger a download.
 * Columns: source_text, target_text, confidence
 * All pairs are included (1:1, 1:0, 0:1) so that gap rows are preserved when
 * the file is imported back into ParallelTexts.
 * Gap encoding: the empty side is an empty string (e.g. "src\t\t" for a 1:0 gap).
 */
export function downloadAlignmentTsv(record: AlignmentRecord): void {
  const { result, sourceBookTitle, targetBookTitle } = record
  const { pairs } = result

  const header = [
    `# exported_by=ParallelTexts`,
    `# source_title=${sourceBookTitle}`,
    `# target_title=${targetBookTitle}`,
    `# src_lang=${result.src_lang}`,
    `# tgt_lang=${result.tgt_lang}`,
    `# total_pairs=${pairs.length}`,
    `source_text\ttarget_text\tconfidence`,
  ].join("\n")

  const rows = pairs.map((p) => {
    const src = (p.src_text ?? "").replace(/\t/g, " ").replace(/\n/g, " ")
    const tgt = (p.tgt_text ?? "").replace(/\t/g, " ").replace(/\n/g, " ")
    const conf = p.confidence != null ? p.confidence.toFixed(4) : ""
    return `${src}\t${tgt}\t${conf}`
  })

  const tsv = [header, ...rows].join("\n")
  const blob = new Blob([tsv], {
    type: "text/tab-separated-values;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download =
    `${sourceBookTitle}-${targetBookTitle}_${result.src_lang}-${result.tgt_lang}.tsv`
      .replace(/[/\\:*?"<>|]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 120)
  a.click()

  URL.revokeObjectURL(url)
}
