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

/**
 * A 0:1 pair (target-only content, no source sentence) has no src_para_idx
 * of its own. Rather than dumping every one of these onto paragraph 0
 * (which used to bury real content — a translator's inserted line, a split
 * sentence — under whatever paragraph happens to be first in the book), it
 * needs to attach to a real neighboring paragraph. Which neighbor is
 * "correct" isn't simply "whichever came before it": tgt_para_idx records
 * which *target*-language paragraph the orphan's sentence actually came
 * from, and on a real book, a clear majority of orphans share their
 * tgt_para_idx with the *next* real pair, not the previous one — the
 * translator split one target paragraph across two sentences, and the
 * source-less one happens to come first. So: scan forward past any other
 * orphans to the next real pair; if it's from the same target paragraph,
 * attach there. Otherwise fall back to the nearest preceding paragraph
 * (also the fallback for a leading orphan with nothing before it, or a
 * trailing one with nothing after it). Pairs arrive in strict reading order
 * (bandedNWAlign consumes src/tgt monotonically). A 1:0 pair always has a
 * real src_para_idx already, so it's unaffected by any of this.
 * SAMPLE:
 * Input:
 * src_para  tgt_para  src_text              tgt_text
 * 115       96        "Hello."              "こんにちは。"
 * null      97        ""                    "In middle school?"   ← 0:1 orphan
 * 116       97        "Wait."               "待て、羽川…"
 * 116       97        "What?"               "何？"
 * Output:
 * 115 → [ { src: "Hello.", tgt: "こんにちは。" } ]
 * 116 → [
          { src: "",      tgt: "In middle school?" },  // attached forward (same tgt_para 97)
          { src: "Wait.", tgt: "待て、羽川…" },
          { src: "What?", tgt: "何？" },
        ]
 */
export function groupPairsByParagraph(
  pairs: AlignedPair[]
): Map<number, AlignedPair[]> {
  const map = new Map<number, AlignedPair[]>()
  let lastSrcParaIdx = 0
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    let idx: number
    if (pair.src_para_idx !== null) {
      idx = pair.src_para_idx
      lastSrcParaIdx = idx
    } else {
      idx = lastSrcParaIdx
      if (pair.tgt_para_idx !== null) {
        for (let j = i + 1; j < pairs.length; j++) {
          const next = pairs[j]
          if (next.src_para_idx !== null) {
            if (next.tgt_para_idx === pair.tgt_para_idx) idx = next.src_para_idx
            break
          }
        }
      }
    }
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
 * (popover and side-by-side). Paragraphs and pagination are driven by the
 * source text — a 0:1 pair (target-only content with no source sentence) has
 * no source paragraph of its own, so it's grouped into the nearest preceding
 * one (see groupPairsByParagraph) and rendered there alongside the aligned
 * pairs. Keeping both views on this same paragraph list is what lets them
 * share one PaginatedReader and one reading-progress cursor.
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
        pairs: spPairs.filter((p) => p.src_text.trim() || p.tgt_text.trim()),
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
        pairs: ps.filter((p) => p.src_text.trim() || p.tgt_text.trim()),
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
