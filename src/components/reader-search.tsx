import { CaretDown, CaretUp, MagnifyingGlass, X } from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"

export interface SearchResult {
  id: string
  paraIdx: number
  snippet: string
}

export interface ReaderSearchProps {
  query: string
  onQueryChange: (q: string) => void
  results: SearchResult[]
  hasMore: boolean
  currentIndex: number
  onSelect: (idx: number) => void
  onPrev: () => void
  onNext: () => void
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  /** Returns the 1-based page number for a paragraph index. Read from live DOM. */
  getPage: (paraIdx: number) => number
  /** Jump to a 1-based page number. */
  onJumpToPage: (page: number) => void
  /** Returns the current total page count from the reader. */
  getTotal: () => number
}

type Mode = "text" | "page"

export function ReaderSearch({
  query,
  onQueryChange,
  results,
  hasMore,
  currentIndex,
  onSelect,
  onPrev,
  onNext,
  isOpen,
  onOpen,
  onClose,
  getPage,
  onJumpToPage,
  getTotal,
}: ReaderSearchProps) {
  const textInputRef = useRef<HTMLInputElement>(null)
  const pageInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [mode, setMode] = useState<Mode>("text")
  const [pageInput, setPageInput] = useState("")

  // Stable ref so key handler never captures stale callbacks
  const cbRef = useRef({
    onOpen,
    onClose,
    onPrev,
    onNext,
    onJumpToPage,
    getTotal,
  })
  cbRef.current = { onOpen, onClose, onPrev, onNext, onJumpToPage, getTotal }

  // Stable ref for "execute go-to-page" so key handler can call it
  const doJumpRef = useRef<(() => void) | undefined>(undefined)
  doJumpRef.current = () => {
    const page = parseInt(pageInput, 10)
    const total = cbRef.current.getTotal()
    if (!isNaN(page) && page >= 1 && page <= total) {
      cbRef.current.onJumpToPage(page)
    }
  }

  // Focus the right input when panel opens or mode changes
  useEffect(() => {
    if (!isOpen) return
    requestAnimationFrame(() => {
      if (mode === "text") textInputRef.current?.focus()
      else pageInputRef.current?.select()
    })
  }, [isOpen, mode])

  // Scroll selected result into view
  useEffect(() => {
    if (currentIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${currentIndex}"]`
    )
    item?.scrollIntoView({ block: "nearest" })
  }, [currentIndex])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault()
        if (!isOpen) cbRef.current.onOpen()
        setMode("text")
        requestAnimationFrame(() => textInputRef.current?.focus())
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "g") {
        e.preventDefault()
        if (!isOpen) cbRef.current.onOpen()
        setMode("page")
        requestAnimationFrame(() => pageInputRef.current?.select())
        return
      }
      if (e.key === "Escape" && isOpen) {
        cbRef.current.onClose()
        return
      }
      if (e.key === "Enter" && isOpen) {
        if (mode === "text" && results.length > 0) {
          e.preventDefault()
          if (e.shiftKey) cbRef.current.onPrev()
          else cbRef.current.onNext()
        } else if (mode === "page") {
          e.preventDefault()
          doJumpRef.current?.()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, mode, results.length])

  function switchMode(m: Mode) {
    setMode(m)
    if (m === "page") setPageInput("")
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          onOpen()
          switchMode("text")
        }}
        className="absolute top-3 right-4 z-20 flex size-10 items-center justify-center rounded-full bg-background shadow-md ring-1 ring-border hover:bg-muted"
        aria-label="Search"
      >
        <MagnifyingGlass className="size-4 text-muted-foreground" />
      </button>
    )
  }

  const total = getTotal()
  const parsedPage = parseInt(pageInput, 10)
  const pageIsValid =
    !isNaN(parsedPage) && parsedPage >= 1 && parsedPage <= total

  const resultLabel = !query.trim()
    ? null
    : results.length === 0
      ? "No results"
      : hasMore
        ? `${results.length}+ matches`
        : `${results.length} match${results.length !== 1 ? "es" : ""}`

  return (
    <div className="absolute top-3 right-4 z-20 flex w-[min(calc(100vw-2rem),22rem)] flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <button
          type="button"
          onClick={() => switchMode("text")}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            mode === "text"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Search text
        </button>
        <button
          type="button"
          onClick={() => switchMode("page")}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            mode === "page"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Go to page
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── Text search mode ────────────────────────────────────────────────── */}
      {mode === "text" && (
        <>
          <div className="flex items-center gap-1.5 px-2.5 py-2">
            <MagnifyingGlass className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={textInputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          {query.trim() && (
            <div className="flex items-center justify-between border-t px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">
                {resultLabel}
              </span>
              {results.length > 0 && (
                <div className="flex items-center gap-0.5">
                  {currentIndex >= 0 && (
                    <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">
                      {currentIndex + 1} / {results.length}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onPrev}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Previous result"
                  >
                    <CaretUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onNext}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Next result"
                  >
                    <CaretDown className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div
              ref={listRef}
              className="max-h-60 overflow-y-auto border-t"
              role="listbox"
            >
              {results.map((result, idx) => {
                const page = getPage(result.paraIdx)
                const isSelected = idx === currentIndex
                return (
                  <button
                    key={result.id}
                    type="button"
                    data-idx={idx}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => onSelect(idx)}
                    className={`w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60 ${
                      isSelected ? "bg-muted" : ""
                    }`}
                  >
                    <p className="line-clamp-2 text-sm text-foreground">
                      {result.snippet}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Page {page}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Go to page mode ─────────────────────────────────────────────────── */}
      {mode === "page" && (
        <div className="flex items-center gap-2 px-3 py-3">
          <span className="shrink-0 text-sm text-muted-foreground">Page</span>
          <input
            ref={pageInputRef}
            type="number"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            min={1}
            max={total}
            placeholder={total > 0 ? `1–${total}` : ""}
            className={`w-20 [appearance:textfield] rounded border bg-transparent px-2 py-1 text-center text-sm outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
              pageInput && !pageIsValid
                ? "border-destructive text-destructive"
                : "border-input"
            }`}
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            of {total}
          </span>
          <button
            type="button"
            onClick={() => doJumpRef.current?.()}
            disabled={!pageIsValid}
            className="ml-auto shrink-0 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Go
          </button>
        </div>
      )}
    </div>
  )
}
