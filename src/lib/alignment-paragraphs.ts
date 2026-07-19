import type { ImageMode } from "@/lib/user-settings"
import type {
  AlignedPair,
  AlignmentResult,
  ImageAsset,
} from "@/types/alignment"

export interface ParagraphData {
  text: string
  pairs: AlignedPair[]
  images: ImageAsset[]
}

export interface AlignmentSearchResult {
  id: string
  paraIdx: number
  snippet: string
}

export function groupPairsByParagraph(
  pairs: AlignedPair[]
): Map<number, AlignedPair[]> {
  const map = new Map<number, AlignedPair[]>()
  for (const pair of pairs) {
    const idx = pair.src_para_idx ?? 0
    if (!map.has(idx)) map.set(idx, [])
    map.get(idx)!.push(pair)
  }
  return map
}

export function buildParagraphText(pairs: AlignedPair[]): string {
  return [...pairs]
    .sort((a, b) => (a.src_sent_idx ?? 0) - (b.src_sent_idx ?? 0))
    .filter((p) => p.src_text.trim())
    .map((p) => p.src_text)
    .join(" ")
}

/**
 * Builds the display paragraph list shared by every alignment reading view
 * (popover and side-by-side). Paragraphs and pagination are always driven by
 * the source text — a 0:1 pair (target-only content with no source sentence)
 * has no home paragraph and is not shown, matching the popover reader's
 * long-standing behavior. Keeping both views on this same paragraph list is
 * what lets them share one PaginatedReader and one reading-progress cursor.
 */
export function buildAlignmentParagraphs(
  result: AlignmentResult,
  imageMode: ImageMode
): ParagraphData[] {
  const {
    pairs,
    source_paragraphs: srcParas = [],
    target_paragraphs: tgtParas = [],
  } = result
  const grouped = groupPairsByParagraph(pairs)

  // ── Primary path: source_paragraphs available (all new alignments) ──────
  if (srcParas.length > 0) {
    // The display paragraphs are the filtered source paragraphs in order.
    const filtered = srcParas.filter(
      (sp) => sp.text.trim() || sp.images.length > 0
    )

    // Step 1: map each tgt_para_idx that appears in pairs → display index
    const tgtParaToDisplay = new Map<number, number>()
    filtered.forEach((sp, displayIdx) => {
      const spPairs = grouped.get(sp.para_idx) ?? []
      for (const pair of spPairs) {
        if (
          pair.tgt_para_idx !== null &&
          !tgtParaToDisplay.has(pair.tgt_para_idx)
        ) {
          tgtParaToDisplay.set(pair.tgt_para_idx, displayIdx)
        }
      }
    })

    // Step 2: assign every target paragraph that has images to a display index.
    // Image-only target paragraphs have no pairs referencing them, so we
    // fall back to the nearest preceding aligned paragraph.
    const sortedKnownTgt = [...tgtParaToDisplay.keys()].sort((a, b) => a - b)
    const displayIdxToTgtImgs = new Map<number, ImageAsset[]>()

    for (const tp of tgtParas) {
      if (tp.images.length === 0) continue

      let displayIdx: number
      if (tgtParaToDisplay.has(tp.para_idx)) {
        displayIdx = tgtParaToDisplay.get(tp.para_idx)!
      } else {
        // Binary-search for the smallest known tgt_para_idx > tp.para_idx.
        // Illustrations act as section breaks — they introduce the text that
        // follows, not summarise what came before.
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

    // Step 3: build ParagraphData using pre-computed target images
    return filtered.map((sp, displayIdx) => {
      const spPairs = grouped.get(sp.para_idx) ?? []
      const srcImgs = sp.images
      const tgtImgs = displayIdxToTgtImgs.get(displayIdx) ?? []
      let images: ImageAsset[]
      if (imageMode === "none") images = []
      else if (imageMode === "source") images = srcImgs
      else if (imageMode === "target") images = tgtImgs
      else images = [...srcImgs, ...tgtImgs]

      return {
        text: spPairs.length > 0 ? buildParagraphText(spPairs) : sp.text,
        pairs: spPairs.filter((p) => p.src_text.trim()),
        images,
      }
    })
  }

  // ── Fallback path: no source_paragraphs (old records) ───────────────────
  // Target images looked up via pair tgt_para_idx (image-only tgt paragraphs
  // are missed here, but this path is only hit for legacy records).
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
      let images: ImageAsset[]
      if (imageMode === "none") images = []
      else if (imageMode === "source") images = srcImgs
      else if (imageMode === "target") images = tgtImgs
      else images = [...srcImgs, ...tgtImgs]
      return {
        text: buildParagraphText(ps),
        pairs: ps.filter((p) => p.src_text.trim()),
        images,
      }
    })
    .filter((p) => p.text.trim() || p.images.length > 0)
}

export function searchAlignmentParagraphs(
  paragraphs: ParagraphData[],
  query: string,
  maxResults: number
): { results: AlignmentSearchResult[]; pairKeys: string[]; hasMore: boolean } {
  const q = query.trim().toLowerCase()
  if (!q) return { results: [], pairKeys: [], hasMore: false }

  const results: AlignmentSearchResult[] = []
  const pairKeys: string[] = []
  let hasMore = false

  outer: for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx]
    for (let pairIdx = 0; pairIdx < para.pairs.length; pairIdx++) {
      const pair = para.pairs[pairIdx]
      const srcMatch = pair.src_text.toLowerCase().includes(q)
      const tgtMatch = !srcMatch && pair.tgt_text.toLowerCase().includes(q)
      if (srcMatch || tgtMatch) {
        if (results.length >= maxResults) {
          hasMore = true
          break outer
        }
        const pairKey = `${pIdx}-${pairIdx}`
        results.push({
          id: pairKey,
          paraIdx: pIdx,
          snippet: srcMatch ? pair.src_text : pair.tgt_text,
        })
        pairKeys.push(pairKey)
      }
    }
  }
  return { results, pairKeys, hasMore }
}

/**
 * Assigns a sequential 1-based number to every pair across all paragraphs,
 * in document order. Used for the side-by-side view's optional line-number
 * gutter — the same number appears on both the source and target side of a
 * pair since they're rendered from the same underlying AlignedPair.
 */
export function numberParagraphPairs(
  paragraphs: ReadonlyArray<{ pairs: ReadonlyArray<unknown> }>
): number[][] {
  let counter = 1
  return paragraphs.map((para) => para.pairs.map(() => counter++))
}
