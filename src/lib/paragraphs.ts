import type { SourceParagraph } from "@/types/alignment"

/**
 * Drops empty paragraphs (no text, no images) and reassigns `para_idx` to the
 * filtered array position, so indices stay contiguous from 0.
 *
 * Must be the single source of truth for paragraph indexing wherever
 * `para_idx` is later persisted or compared across call sites (e.g. paragraph
 * exclusions keyed by index) — extraction (`extractEpubContent` etc.) already
 * skips blank paragraphs in the common case, but isn't guaranteed to in every
 * edge case, so this normalization must run identically everywhere `para_idx`
 * is handed to the user or stored.
 */
export function normalizeParagraphs(raw: SourceParagraph[]): SourceParagraph[] {
  return raw
    .filter((p) => p.text.trim() || p.images.length > 0)
    .map((p, i) => ({ ...p, para_idx: i }))
}
