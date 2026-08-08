/**
 * Shared CSS-multi-column paginated reader.
 *
 * Handles all pagination mechanics (ResizeObserver, touch/keyboard nav,
 * progress save/restore, skeleton overlay) so that both the alignment
 * popover reader and the plain book reader can share identical behaviour.
 *
 * The caller is responsible for:
 *   - Rendering paragraph content as `children` with `data-para-idx={i}`
 *     on each paragraph wrapper (required for char-count progress tracking).
 *   - Resolving `savedCharCount` from URL params / localStorage before mount.
 *   - Persisting progress in `onSaveProgress` (update URL + localStorage).
 */

import {
  buildCumulativeCharCounts,
  charCountForPage,
  pageFromCharCount,
} from "@/lib/reading-progress"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import { Skeleton } from "./ui/skeleton"

// ── Constants (exported so callers can reference them for layout math) ────────

export const TEXT_PADDING = 32
export const COLUMN_GAP = 40

// ── Skeleton ──────────────────────────────────────────────────────────────────

const SKELETON_PARAGRAPHS = [
  ["100%", "94%", "97%", "88%", "62%"],
  ["100%", "91%", "79%"],
  ["100%", "96%", "85%", "92%", "48%"],
  ["100%", "89%", "73%"],
]

export function ReaderSkeleton({ fontSize }: { fontSize: number }) {
  const barH = Math.round(fontSize)
  const lineGap = Math.round(fontSize * 0.75)
  const paraGap = Math.round(fontSize * 2.25)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: paraGap }}>
      {SKELETON_PARAGRAPHS.map((widths, pIdx) => (
        <div
          key={pIdx}
          style={{ display: "flex", flexDirection: "column", gap: lineGap }}
        >
          {widths.map((w, lIdx) => (
            <Skeleton
              key={lIdx}
              className="rounded-sm"
              style={{ height: barH, width: w }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

export function getParaElements(inner: HTMLElement): HTMLElement[] {
  return Array.from(inner.querySelectorAll<HTMLElement>("[data-para-idx]"))
}

// ── PaginatedReader ───────────────────────────────────────────────────────────

export interface PaginatedReaderHandle {
  /** Jump to the page that contains the paragraph at `paraIdx`. */
  jumpToParaIdx: (paraIdx: number) => void
  /** Returns the 1-based page number for the paragraph at `paraIdx`. Reads live DOM. */
  getPageForParaIdx: (paraIdx: number) => number
  /** Jump directly to a 1-based page number. Clamped to valid range. */
  jumpToPage: (page: number) => void
  /** Returns the current total page count. */
  getTotalPages: () => number
}

export interface PaginatedReaderProps {
  /**
   * Paragraph objects used for char-count progress math.
   * Must have the same order and length as the DOM elements with data-para-idx.
   */
  paragraphs: ReadonlyArray<{ text: string }>
  /** Char count to restore to on mount. 0 = start from the beginning. */
  savedCharCount: number
  fontSize: number
  pageNumHidden: boolean
  onTogglePageNum: () => void
  /**
   * Called (debounced, ~1 s after page settles) when progress should be
   * persisted.  Also called once immediately after the initial restore so
   * URL params stay in sync.
   */
  onSaveProgress?: (charCount: number, totalChars: number) => void
  /** Called right after the page index changes (e.g. to reset open popovers). */
  onPageChange?: () => void
  /** Shown when paragraphs.length === 0. */
  emptyMessage?: string
  /**
   * Rendered paragraph content. Every direct paragraph wrapper MUST carry
   * a `data-para-idx={i}` attribute so progress tracking can find paragraphs.
   */
  children: ReactNode
  /** Optional slot rendered as an absolute child inside the reader wrapper (e.g. search UI). */
  searchSlot?: ReactNode
}

export const PaginatedReader = forwardRef<
  PaginatedReaderHandle,
  PaginatedReaderProps
>(function PaginatedReader(
  {
    paragraphs,
    savedCharCount,
    fontSize,
    pageNumHidden,
    onTogglePageNum,
    onSaveProgress,
    onPageChange,
    emptyMessage = "No text to display.",
    children,
    searchSlot,
  }: PaginatedReaderProps,
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  // Keep onPageChange in a ref so the page-sync effect only re-runs when
  // `page` actually changes — not on every render when the caller passes an
  // inline arrow (which would close open popovers spuriously).
  const onPageChangeRef = useRef(onPageChange)
  onPageChangeRef.current = onPageChange

  const [page, setPage] = useState(0)

  useImperativeHandle(
    ref,
    () => ({
      jumpToParaIdx: (paraIdx: number) => {
        const outer = scrollRef.current
        const inner = innerRef.current
        if (!outer || !inner) return
        const paraEls = getParaElements(inner)
        if (paraEls.length === 0) return
        const charCount = cumRef.current[paraIdx] ?? 0
        const targetPage = pageFromCharCount(
          charCount,
          paraEls,
          outer.clientWidth,
          COLUMN_GAP,
          cumRef.current
        )
        setPage(Math.min(targetPage, totalPagesRef.current - 1))
      },
      getPageForParaIdx: (paraIdx: number) => {
        const outer = scrollRef.current
        const inner = innerRef.current
        if (!outer || !inner) return 1
        const paraEls = getParaElements(inner)
        if (paraEls.length === 0) return 1
        const charCount = cumRef.current[paraIdx] ?? 0
        return (
          pageFromCharCount(
            charCount,
            paraEls,
            outer.clientWidth,
            COLUMN_GAP,
            cumRef.current
          ) + 1
        )
      },
      jumpToPage: (targetPage: number) => {
        const clamped = Math.max(
          0,
          Math.min(Math.round(targetPage) - 1, totalPagesRef.current - 1)
        )
        setPage(clamped)
      },
      getTotalPages: () => totalPagesRef.current,
    }),
    []
  )
  const [totalPages, setTotalPages] = useState(1)
  // Explicit pixel height for innerRef — avoids iOS Safari's failure to resolve
  // height:100% on a child of a flex:1 item (which causes scrollWidth to read as
  // clientWidth, giving totalPages=1 regardless of content length).
  const [innerHeight, setInnerHeight] = useState<number | null>(null)
  // Explicit column-width in pixels, required for iOS/iPadOS WebKit when
  // column-count:1. Without it, WebKit does not produce horizontal overflow
  // columns and treats the container as a normal block → scrollWidth === clientWidth
  // → totalPages=1 on all iPad browsers (Safari, Chrome, Brave — all share WebKit).
  // ttu-ttu/ebook-reader applies the same fix:
  // https://github.com/ttu-ttu/ebook-reader/blob/main/apps/web/src/lib/components/book-reader/book-reader-paginated/book-reader-paginated.svelte#L769-L772
  // (CSS) and sets the value only when columnCount===1:
  // https://github.com/ttu-ttu/ebook-reader/blob/main/apps/web/src/lib/components/book-reader/book-reader-paginated/book-reader-paginated.svelte#L703
  const [innerColumnWidth, setInnerColumnWidth] = useState<number | null>(null)

  const cumulativeCharCounts = useMemo(
    () => buildCumulativeCharCounts(paragraphs),
    [paragraphs]
  )

  // Capture the initial savedCharCount so changes from debounced saves don't
  // re-trigger the restore logic inside the ResizeObserver.
  const initialSavedCharCount = useRef(savedCharCount)

  // Guards to prevent a debounced save from overwriting a just-restored position.
  const restoredRef = useRef(false)
  const suppressNextSaveRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Skeleton shown while restoring position (prevents page-0 flash).
  const [isPendingRestore, setIsPendingRestore] = useState(
    () => initialSavedCharCount.current > 0
  )

  // ── Progress save helper ──────────────────────────────────────────────────

  const saveProgressRef = useRef(onSaveProgress)
  saveProgressRef.current = onSaveProgress

  const doSave = useRef(() => {
    const outer = scrollRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    const columnWidth = outer.clientWidth
    const paraEls = getParaElements(inner)
    if (paraEls.length === 0) return
    const cc = charCountForPage(
      paraEls,
      page,
      columnWidth,
      COLUMN_GAP,
      cumulativeCharCounts
    )
    const tc = cumulativeCharCounts[cumulativeCharCounts.length - 1]
    saveProgressRef.current?.(cc, tc)
  })

  // Keep page/cumulativeCharCounts visible to the stable doSave ref.
  const pageRef = useRef(page)
  pageRef.current = page
  const cumRef = useRef(cumulativeCharCounts)
  cumRef.current = cumulativeCharCounts

  // Rebuild doSave whenever its captured closure deps change (page, cumCounts).
  useEffect(() => {
    doSave.current = () => {
      const outer = scrollRef.current
      const inner = innerRef.current
      if (!outer || !inner) return
      const columnWidth = outer.clientWidth
      const paraEls = getParaElements(inner)
      if (paraEls.length === 0) return
      const cc = charCountForPage(
        paraEls,
        pageRef.current,
        columnWidth,
        COLUMN_GAP,
        cumRef.current
      )
      const tc = cumRef.current[cumRef.current.length - 1]
      saveProgressRef.current?.(cc, tc)
    }
  }, [])

  // ── ResizeObserver: recalculate pages + restore position on first load ────

  useLayoutEffect(() => {
    const outer = scrollRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const recalc = (fromObserver: boolean) => {
      const pageWidth = outer.clientWidth + COLUMN_GAP
      if (pageWidth <= COLUMN_GAP) return

      // Force a concrete pixel height so iOS Safari establishes a definite
      // containing block for the multi-column container. Without this,
      // height:calc(100%-64px) doesn't resolve on real iOS (flex:1 parent),
      // so columnFill:auto gets no height → single infinite column → scrollWidth
      // equals clientWidth → totalPages=1.
      const h = outer.clientHeight - TEXT_PADDING * 2
      if (h > 0) {
        inner.style.height = `${h}px`
        setInnerHeight(h)
      }

      // Provide an explicit column-width so WebKit (iOS/iPadOS) creates
      // horizontal overflow columns. On Blink (Android/desktop) column-count:1
      // alone is sufficient, but WebKit ignores it without a concrete column-width.
      // https://github.com/ttu-ttu/ebook-reader/blob/main/apps/web/src/lib/components/book-reader/book-reader-paginated/book-reader-paginated.svelte#L769-L772
      const cw = outer.clientWidth
      inner.style.columnWidth = `${cw}px`
      setInnerColumnWidth(cw)

      // Count pages via getBoundingClientRect() on the last paragraph rather
      // than inner.scrollWidth. On iOS WebKit, scrollWidth inside an
      // overflow:hidden parent returns clientWidth even when multi-column has
      // produced multiple horizontal columns, giving totalPages=1 regardless
      // of content length. getBoundingClientRect() reads actual layout positions
      // and is not affected by the parent's overflow clipping.
      const paraEls = getParaElements(inner)
      let total: number
      if (paraEls.length > 0) {
        const innerLeft = inner.getBoundingClientRect().left
        const lastRight =
          paraEls[paraEls.length - 1].getBoundingClientRect().right
        total = Math.max(
          1,
          Math.round((lastRight - innerLeft + COLUMN_GAP) / pageWidth)
        )
      } else {
        total = Math.max(
          1,
          Math.round((inner.scrollWidth + COLUMN_GAP) / pageWidth)
        )
      }
      setTotalPages(total)

      if (!fromObserver) return

      if (!restoredRef.current) {
        restoredRef.current = true
        const charCountToRestore = initialSavedCharCount.current
        if (charCountToRestore > 0) {
          const paraEls = getParaElements(inner)
          const clampedPage = Math.min(
            pageFromCharCount(
              charCountToRestore,
              paraEls,
              outer.clientWidth,
              COLUMN_GAP,
              cumRef.current
            ),
            total - 1
          )
          const restoredCc = charCountForPage(
            paraEls,
            clampedPage,
            outer.clientWidth,
            COLUMN_GAP,
            cumRef.current
          )
          const tc = cumRef.current[cumRef.current.length - 1]
          saveProgressRef.current?.(restoredCc, tc)
          outer.scrollTo({
            left: clampedPage * (outer.clientWidth + COLUMN_GAP),
            behavior: "instant" as ScrollBehavior,
          })
          suppressNextSaveRef.current = true
          setPage(clampedPage)
          setIsPendingRestore(false)
          return
        }
        setIsPendingRestore(false)
      }

      setPage((p) => Math.min(p, total - 1))
    }

    recalc(false)
    const ro = new ResizeObserver(() => recalc(true))
    ro.observe(outer)
    return () => ro.disconnect()
  }, [paragraphs, fontSize])

  // ── Sync page → scroll position ───────────────────────────────────────────

  useEffect(() => {
    const outer = scrollRef.current
    if (!outer) return
    outer.scrollTo({
      left: page * (outer.clientWidth + COLUMN_GAP),
      behavior: "instant" as ScrollBehavior,
    })
    onPageChangeRef.current?.()
  }, [page])

  // ── Debounced auto-save ───────────────────────────────────────────────────

  useEffect(() => {
    if (!restoredRef.current) return
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false
      return
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => doSave.current(), 1000)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [page])

  // ── Keyboard navigation ───────────────────────────────────────────────────

  const totalPagesRef = useRef(totalPages)
  totalPagesRef.current = totalPages

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(e.target.tagName)
      )
        return
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1))
      else if (e.key === "ArrowRight")
        setPage((p) => Math.min(totalPagesRef.current - 1, p + 1))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ── Touch navigation (iOS Safari non-passive touchmove) ───────────────────

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let startX = 0
    let startY = 0

    function onStart(e: TouchEvent) {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
    function onMove(e: TouchEvent) {
      e.preventDefault()
    }
    function onEnd(e: TouchEvent) {
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      if (Math.abs(dx) > 40 && dy < 80) {
        if (dx < 0) setPage((p) => Math.min(totalPagesRef.current - 1, p + 1))
        else setPage((p) => Math.max(0, p - 1))
      }
    }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  if (paragraphs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const canPrev = page > 0
  const canNext = page < totalPages - 1

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {searchSlot}
      {isPendingRestore && (
        <div className="absolute inset-0 z-20 bg-background">
          <ReaderSkeleton fontSize={fontSize} />
        </div>
      )}

      {/* Left nav zone */}
      <div
        className={`group absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center transition-all duration-200 sm:w-16 ${
          canPrev
            ? "cursor-pointer hover:bg-black/7 dark:hover:bg-white/7"
            : "pointer-events-none"
        }`}
        onClick={() => canPrev && setPage((p) => p - 1)}
      >
        <CaretLeft
          className={`transition-all duration-200 ${canPrev ? "opacity-0 group-hover:opacity-100" : "opacity-0"}`}
          style={{ width: 56, height: 56, strokeWidth: 2.5, color: "white" }}
        />
      </div>

      {/* Right nav zone */}
      <div
        className={`group absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-center transition-all duration-200 sm:w-16 ${
          canNext
            ? "cursor-pointer hover:bg-black/7 dark:hover:bg-white/7"
            : "pointer-events-none"
        }`}
        onClick={() => canNext && setPage((p) => p + 1)}
      >
        <CaretRight
          className={`transition-all duration-200 ${canNext ? "opacity-0 group-hover:opacity-100" : "opacity-0"}`}
          style={{ width: 56, height: 56, strokeWidth: 2.5, color: "white" }}
        />
      </div>

      {/* Scroll container — overflow:hidden, programmatic scroll only */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: "none" }}
      >
        <div
          ref={innerRef}
          style={{
            columnCount: 1,
            // Required for WebKit (iOS/iPadOS): without an explicit column-width,
            // column-count:1 does not create horizontal overflow columns on Safari.
            // https://github.com/ttu-ttu/ebook-reader/blob/main/apps/web/src/lib/components/book-reader/book-reader-paginated/book-reader-paginated.svelte#L769-L772
            columnWidth:
              innerColumnWidth != null ? `${innerColumnWidth}px` : undefined,
            columnFill: "auto",
            columnGap: COLUMN_GAP,
            height:
              innerHeight != null
                ? `${innerHeight}px`
                : `calc(100% - ${TEXT_PADDING * 2}px)`,
            marginTop: TEXT_PADDING,
            fontSize: `${fontSize}px`,
            lineHeight: 1.75,
          }}
        >
          {children}
        </div>
      </div>

      {/* Page indicator */}
      <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
        {pageNumHidden ? (
          <button
            type="button"
            onClick={onTogglePageNum}
            className="h-1 w-8 rounded-full bg-muted-foreground/25 opacity-0 transition-opacity hover:opacity-100"
            aria-label="Show page number"
          />
        ) : (
          <button
            type="button"
            onClick={onTogglePageNum}
            className="rounded px-2 py-0.5 text-xs text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-muted-foreground"
            aria-label="Hide page number"
          >
            {page + 1} / {totalPages}
          </button>
        )}
      </div>
    </div>
  )
})
