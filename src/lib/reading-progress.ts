/**
 * Character-count-based reading progress for the popover alignment reader.
 *
 * Inspired by ttu-ttu/ebook-reader's exploredCharCount approach:
 *   - BookmarkManagerPaginated: https://github.com/ttu-ttu/ebook-reader/blob/main/apps/web/src/lib/components/book-reader/book-reader-paginated/bookmark-manager-paginated.ts
 *   - SectionCharacterStatsCalculator: https://github.com/ttu-ttu/ebook-reader/blob/main/apps/web/src/lib/components/book-reader/book-reader-paginated/section-character-stats-calculator.ts
 *
 * Key difference: ttu-ttu tracks the LAST visible character; we track the
 * FIRST paragraph on the current page so "resume reading" feels natural.
 *
 * Two-layer persistence:
 *   - URL params (charCount + totalChars): session layer, survives refresh
 *   - localStorage (pt:progress:{id}): persistent layer, survives navigation
 * Restore priority: URL param first, localStorage fallback.
 */

const progressKey = (id: string) => `pt:progress:${id}`

export function getAlignmentProgress(
  id: string
): { charCount: number; totalChars: number } | null {
  try {
    const raw = localStorage.getItem(progressKey(id))
    if (!raw) return null
    const p = JSON.parse(raw)
    if (
      typeof p.charCount === "number" &&
      typeof p.totalChars === "number" &&
      p.charCount >= 0 &&
      p.totalChars > 0
    )
      return { charCount: p.charCount, totalChars: p.totalChars }
    return null
  } catch {
    return null
  }
}

export function setAlignmentProgress(
  id: string,
  charCount: number,
  totalChars: number
): void {
  try {
    localStorage.setItem(
      progressKey(id),
      JSON.stringify({ charCount, totalChars })
    )
  } catch {}
}

export function getBookProgress(
  id: string
): { charCount: number; totalChars: number } | null {
  return getAlignmentProgress(`book:${id}`)
}

export function setBookProgress(
  id: string,
  charCount: number,
  totalChars: number
): void {
  setAlignmentProgress(`book:${id}`, charCount, totalChars)
}

/**
 * Builds a cumulative character count array from an array of paragraph objects.
 * result[i] = total chars in paragraphs[0..i-1], result[0] = 0.
 * result[paragraphs.length] = total chars across all paragraphs.
 */
export function buildCumulativeCharCounts(
  paragraphs: ReadonlyArray<{ text: string }>
): number[] {
  const result = new Array<number>(paragraphs.length + 1)
  result[0] = 0
  for (let i = 0; i < paragraphs.length; i++) {
    result[i + 1] = result[i] + paragraphs[i].text.length
  }
  return result
}

/**
 * Returns the cumulative char count of the first paragraph visible on `page`.
 *
 * Uses offsetLeft on each paragraph element (which CSS multi-column sets to
 * reflect the column the element lands in). A paragraph belongs to page N if:
 *   offsetLeft >= N * (columnWidth + columnGap)
 *
 * Adapted from ttu-ttu's SectionCharacterStatsCalculator.getCharCountByScrollPos
 * which maps scroll position → character count using accumulated paragraph positions.
 */
export function charCountForPage(
  paraEls: HTMLElement[],
  page: number,
  columnWidth: number,
  columnGap: number,
  cumulative: number[]
): number {
  const pageStart = page * (columnWidth + columnGap)
  for (let i = 0; i < paraEls.length; i++) {
    if (paraEls[i].offsetLeft >= pageStart) {
      return cumulative[i]
    }
  }
  // No paragraph found on this page (e.g. last page is empty tail) — return total
  return cumulative[cumulative.length - 1]
}

/**
 * Given a saved charCount, returns the page number that contains that character.
 *
 * Binary-searches cumulative to find the paragraph index, then reads that
 * paragraph's offsetLeft to determine which column (page) it landed in.
 *
 * Adapted from ttu-ttu's SectionCharacterStatsCalculator.getScrollPosByCharCount
 * which binary-searches accumulatedCharCount to find the paragraph, then snaps
 * to a screen boundary.
 */
export function pageFromCharCount(
  charCount: number,
  paraEls: HTMLElement[],
  columnWidth: number,
  columnGap: number,
  cumulative: number[]
): number {
  if (charCount <= 0 || paraEls.length === 0) return 0

  // Binary search: find largest i where cumulative[i] <= charCount
  let lo = 0
  let hi = paraEls.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cumulative[mid] <= charCount) lo = mid
    else hi = mid - 1
  }

  const paraEl = paraEls[lo]
  return Math.floor(paraEl.offsetLeft / (columnWidth + columnGap))
}
