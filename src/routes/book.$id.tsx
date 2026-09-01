import {
  PaginatedReader,
  ReaderSkeleton,
  type PaginatedReaderHandle,
} from "@/components/paginated-reader"
import { ReaderSearch, type SearchResult } from "@/components/reader-search"
import { Button } from "@/components/ui/button"
import { extractEpubContent } from "@/lib/epub"
import { normalizeParagraphs } from "@/lib/paragraphs"
import {
  getOperationErrorMessage,
  trackOperation,
  withTimeout,
} from "@/lib/operation-diagnostics"
import { extractPdfContent } from "@/lib/pdf"
import { getBookProgress, setBookProgress } from "@/lib/reading-progress"
import { splitIntoSentences } from "@/lib/sentence-splitter"
import { extractTxtContent } from "@/lib/txt"
import { getStoredFontSize } from "@/lib/user-settings"
import { cn } from "@/lib/utils"
import { getBook } from "@/store/books"
import { getExclusions, setExclusions } from "@/store/exclusions"
import type { ImageAsset, SourceParagraph } from "@/types/alignment"
import type { Book } from "@/types/book"
import {
  BookOpenIcon,
  BookOpenTextIcon,
  CaretLeftIcon,
  CheckSquareOffsetIcon,
} from "@phosphor-icons/react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

export const Route = createFileRoute("/book/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search.view === "read" ? ("read" as const) : ("detail" as const),
    pageNumHidden: search.pageNumHidden === true,
    charCount:
      typeof search.charCount === "number" && search.charCount >= 0
        ? Math.floor(search.charCount)
        : 0,
    totalChars:
      typeof search.totalChars === "number" && search.totalChars > 0
        ? Math.floor(search.totalChars)
        : 0,
  }),
  component: BookDetailPage,
})

// ── Simple paragraph block (no popover, just text) ────────────────────────────

const BookParagraphBlock = memo(function BookParagraphBlock({
  para,
  pIdx,
  selectionMode = false,
  excluded = false,
  onToggleExclude,
}: {
  para: SourceParagraph
  pIdx: number
  selectionMode?: boolean
  excluded?: boolean
  onToggleExclude?: (pIdx: number) => void
}) {
  return (
    <div
      data-para-idx={pIdx}
      onClick={selectionMode ? () => onToggleExclude?.(pIdx) : undefined}
      className={cn(
        "relative px-12 sm:px-16 lg:px-4",
        selectionMode && "cursor-pointer rounded-md",
        selectionMode && !excluded && "hover:bg-muted/60",
        excluded && "opacity-50"
      )}
      style={{
        breakInside: "avoid",
        marginBottom: "1.5rem",
        maxWidth: "56rem",
        marginInline: "auto",
        borderLeft: excluded ? "3px solid var(--color-destructive)" : undefined,
        paddingLeft: excluded ? "0.75rem" : undefined,
      }}
    >
      {excluded && (
        <span className="absolute -top-2 right-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
          Excluded
        </span>
      )}
      {para.images.map((img: ImageAsset) => (
        <img
          key={img.id}
          src={`data:${img.mime_type};base64,${img.data_base64}`}
          alt=""
          className="mx-auto mb-4 max-h-80 max-w-full object-contain"
        />
      ))}
      {para.text && <p>{para.text}</p>}
    </div>
  )
})

// ── Book reader (extracts content + renders PaginatedReader) ──────────────────

const MAX_BOOK_RESULTS = 30
const CONTEXT_CHARS = 50

function BookReader({
  book,
  fontSize,
  pageNumHidden,
  onTogglePageNum,
  savedCharCount,
  onSaveProgress,
}: {
  book: Book
  fontSize: number
  pageNumHidden: boolean
  onTogglePageNum: () => void
  savedCharCount: number
  onSaveProgress: (charCount: number, totalChars: number) => void
}) {
  const readerRef = useRef<PaginatedReaderHandle>(null)
  const [paragraphs, setParagraphs] = useState<SourceParagraph[] | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)

  // ── Exclusion selection mode ─────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false)
  const [excludedParaIdxs, setExcludedParaIdxs] = useState<Set<number>>(
    () => new Set()
  )
  // Guards the persist effect below from firing (and overwriting real data
  // with an empty set) before the load effect has resolved at least once.
  const hasLoadedExclusionsRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    hasLoadedExclusionsRef.current = false
    // Reset synchronously so a book switch never briefly shows the previous
    // book's exclusions on the new book's paragraphs while the real load
    // (below) is in flight — BookReader isn't remounted on a book.id change,
    // so without this, stale state would otherwise linger until it resolves.
    setExcludedParaIdxs(new Set())
    getExclusions(book.id).then((idxs) => {
      if (cancelled) return
      setExcludedParaIdxs(new Set(idxs))
      hasLoadedExclusionsRef.current = true
    })
    return () => {
      cancelled = true
    }
  }, [book.id])

  // Persists excludedParaIdxs whenever it changes, rather than writing to
  // Dexie inside the setState updater below — an updater must stay pure
  // (React may invoke it more than once, e.g. under StrictMode), and a
  // dedicated effect always runs against the latest committed state, so a
  // burst of rapid clicks still ends up with the correct final set on disk
  // even though each click's updater only touches React state.
  useEffect(() => {
    if (!hasLoadedExclusionsRef.current) return
    setExclusions(book.id, [...excludedParaIdxs])
  }, [book.id, excludedParaIdxs])

  function toggleExcludedPara(pIdx: number) {
    // Ignore toggles that land before the initial load resolves — otherwise
    // the load's `setExcludedParaIdxs` (a plain, unconditional overwrite)
    // would silently clobber a click that snuck in first. The check and the
    // load's `.then()` callback both run on the JS main thread, so there's
    // no interleaving possible: by the time this runs, hasLoadedExclusionsRef
    // is either already true (safe to toggle) or the load genuinely hasn't
    // landed yet (in which case there's nothing yet to safely toggle against).
    if (!hasLoadedExclusionsRef.current) return
    setExcludedParaIdxs((prev) => {
      const next = new Set(prev)
      if (next.has(pIdx)) next.delete(pIdx)
      else next.add(pIdx)
      return next
    })
  }

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchIdx, setSearchIdx] = useState(-1)

  const searchData = useMemo((): {
    results: SearchResult[]
    hasMore: boolean
  } => {
    const q = searchQuery.trim().toLowerCase()
    if (!q || !paragraphs) return { results: [], hasMore: false }

    const results: SearchResult[] = []
    let hasMore = false

    for (let i = 0; i < paragraphs.length; i++) {
      const text = paragraphs[i].text
      const idx = text.toLowerCase().indexOf(q)
      if (idx !== -1) {
        if (results.length >= MAX_BOOK_RESULTS) {
          hasMore = true
          break
        }
        const start = Math.max(0, idx - CONTEXT_CHARS)
        const end = Math.min(text.length, idx + q.length + CONTEXT_CHARS)
        const snippet =
          (start > 0 ? "…" : "") +
          text.slice(start, end) +
          (end < text.length ? "…" : "")
        results.push({ id: i.toString(), paraIdx: i, snippet })
      }
    }
    return { results, hasMore }
  }, [searchQuery, paragraphs])

  // Reset selection (no auto-jump) when query changes
  useEffect(() => {
    setSearchIdx(-1)
  }, [searchQuery])

  function goToResult(idx: number) {
    const result = searchData.results[idx]
    if (!result) return
    readerRef.current?.jumpToParaIdx(result.paraIdx)
  }

  function handleSelect(idx: number) {
    setSearchIdx(idx)
    goToResult(idx)
  }

  function handleSearchNext() {
    if (searchData.results.length === 0) return
    const next = searchIdx < 0 ? 0 : (searchIdx + 1) % searchData.results.length
    setSearchIdx(next)
    goToResult(next)
  }

  function handleSearchPrev() {
    if (searchData.results.length === 0) return
    const prev =
      searchIdx < 0
        ? searchData.results.length - 1
        : (searchIdx - 1 + searchData.results.length) %
          searchData.results.length
    setSearchIdx(prev)
    goToResult(prev)
  }

  function handleSearchClose() {
    setSearchOpen(false)
    setSearchQuery("")
    setSearchIdx(-1)
  }

  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function extract() {
      try {
        const raw = await withTimeout(
          "Opening book",
          60_000,
          book.type === "epub"
            ? extractEpubContent(book.fileBlob)
            : book.type === "pdf"
              ? extractPdfContent(book.fileBlob)
              : extractTxtContent(book.fileBlob)
        )
        if (cancelled) return
        setParagraphs(normalizeParagraphs(raw))
      } catch (err) {
        if (!cancelled) {
          const message = getOperationErrorMessage(
            err,
            "Failed to extract text."
          )
          setExtractError(message)
        }
      }
    }
    extract()
    return () => {
      cancelled = true
    }
  }, [book.id, book.type])

  if (extractError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-destructive">{extractError}</p>
      </div>
    )
  }

  if (!paragraphs) {
    return (
      <div className="flex-1 overflow-hidden" style={{ padding: 32 }}>
        <div className="mx-auto max-w-3xl">
          <ReaderSkeleton fontSize={fontSize} />
        </div>
      </div>
    )
  }

  return (
    <>
      <PaginatedReader
        ref={readerRef}
        paragraphs={paragraphs}
        savedCharCount={savedCharCount}
        fontSize={fontSize}
        pageNumHidden={pageNumHidden}
        onTogglePageNum={onTogglePageNum}
        onSaveProgress={onSaveProgress}
        emptyMessage="No text found in this book."
        searchSlot={
          <ReaderSearch
            query={searchQuery}
            onQueryChange={(q) => setSearchQuery(q)}
            results={searchData.results}
            hasMore={searchData.hasMore}
            currentIndex={searchIdx}
            onSelect={handleSelect}
            onPrev={handleSearchPrev}
            onNext={handleSearchNext}
            isOpen={searchOpen}
            onOpen={() => setSearchOpen(true)}
            onClose={handleSearchClose}
            getPage={(paraIdx) =>
              readerRef.current?.getPageForParaIdx(paraIdx) ?? 1
            }
            onJumpToPage={(page) => readerRef.current?.jumpToPage(page)}
            getTotal={() => readerRef.current?.getTotalPages() ?? 1}
          />
        }
      >
        {paragraphs.map((para, idx) => (
          <BookParagraphBlock
            key={idx}
            para={para}
            pIdx={idx}
            selectionMode={selectionMode}
            excluded={excludedParaIdxs.has(idx)}
            onToggleExclude={toggleExcludedPara}
          />
        ))}
      </PaginatedReader>
      <button
        type="button"
        onClick={() => setSelectionMode((v) => !v)}
        className={cn(
          "absolute right-4 bottom-3 z-30 flex size-10 items-center justify-center rounded-full shadow-md ring-1 transition-colors",
          selectionMode
            ? "bg-primary text-primary-foreground ring-primary"
            : "bg-background text-muted-foreground ring-border hover:bg-muted"
        )}
        aria-pressed={selectionMode}
        aria-label={
          selectionMode
            ? "Exit paragraph exclusion mode"
            : "Exclude paragraphs from alignment"
        }
        title={
          selectionMode
            ? "Done selecting"
            : "Select paragraphs to exclude from alignment"
        }
      >
        <CheckSquareOffsetIcon className="size-5" />
      </button>
    </>
  )
}

// ── Sentence count stat (async extraction) ────────────────────────────────────

function useSentenceCount(book: Book | null) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!book) return
    let cancelled = false
    setLoading(true)
    setCount(null)

    async function run() {
      try {
        const paras =
          book!.type === "epub"
            ? await extractEpubContent(book!.fileBlob)
            : book!.type === "pdf"
              ? await extractPdfContent(book!.fileBlob)
              : await extractTxtContent(book!.fileBlob)
        if (cancelled) return
        const { records } = splitIntoSentences(paras, "en", 200_000)
        if (!cancelled) setCount(records.length)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [book?.id])

  return { count, loading }
}

// ── Page ──────────────────────────────────────────────────────────────────────

function BookDetailPage() {
  const { id } = Route.useParams()
  const { view, pageNumHidden, charCount, totalChars } = Route.useSearch()
  const navigate = useNavigate({ from: "/book/$id" })
  const [book, setBook] = useState<Book | null>(null)
  const [notFoundState, setNotFoundState] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [fontSize] = useState(() => getStoredFontSize())
  const { count, loading: countLoading } = useSentenceCount(
    view === "detail" ? book : null
  )

  useEffect(() => {
    let cancelled = false
    setBook(null)
    setNotFoundState(false)
    setLoadError(null)
    void trackOperation("book_reader_load", {}, () => getBook(id))
      .then((nextBook) => {
        if (cancelled) return
        if (!nextBook) setNotFoundState(true)
        else setBook(nextBook)
      })
      .catch((error) => {
        if (cancelled) return
        const message = getOperationErrorMessage(error, "Could not load book.")
        setLoadError(message)
      })

    return () => {
      cancelled = true
    }
  }, [id, loadAttempt])

  function togglePageNum() {
    navigate({ search: (prev) => ({ ...prev, pageNumHidden: !pageNumHidden }) })
  }

  const handleSaveProgress = useCallback(
    (cc: number, tc: number) => {
      navigate({
        replace: true,
        search: (prev) => ({ ...prev, charCount: cc, totalChars: tc }),
      })
      setBookProgress(id, cc, tc)
    },
    [navigate, id]
  )

  if (notFoundState) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">Book not found.</p>
        <Link
          to="/books"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <CaretLeftIcon className="size-4" /> Back to books
        </Link>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-destructive">{loadError}</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => setLoadAttempt((attempt) => attempt + 1)}
        >
          Try again
        </Button>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">
          Opening book… This can take a while for large books.
        </p>
      </div>
    )
  }

  // ── Reader mode ────────────────────────────────────────────────────────────

  if (view === "read") {
    const savedCharCount =
      charCount > 0 ? charCount : (getBookProgress(id)?.charCount ?? 0)

    return (
      <div
        className="relative flex flex-col"
        style={{ height: "calc(100svh - 56px)" }}
      >
        {/* Back to detail */}
        <button
          type="button"
          onClick={() =>
            navigate({ search: (prev) => ({ ...prev, view: "detail" }) })
          }
          className="absolute top-3 left-3 z-30 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur-sm hover:text-foreground"
        >
          <CaretLeftIcon className="size-3.5" /> Detail
        </button>

        <BookReader
          book={book}
          fontSize={fontSize}
          pageNumHidden={pageNumHidden}
          onTogglePageNum={togglePageNum}
          savedCharCount={savedCharCount}
          onSaveProgress={handleSaveProgress}
        />

        {/* Reading progress bar (shown below page indicator when totalChars known) */}
        {totalChars > 0 && (
          <div
            className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-300"
            style={{ width: `${Math.round((charCount / totalChars) * 100)}%` }}
          />
        )}
      </div>
    )
  }

  // ── Detail mode ────────────────────────────────────────────────────────────

  const savedProgress = getBookProgress(id)
  const progressPct =
    totalChars > 0
      ? Math.round((charCount / totalChars) * 100)
      : savedProgress?.totalChars
        ? Math.round((savedProgress.charCount / savedProgress.totalChars) * 100)
        : null

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link
        to="/books"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <CaretLeftIcon className="size-4" /> Books
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Cover */}
        {book.coverDataUrl ? (
          <img
            src={book.coverDataUrl}
            alt={book.title}
            className="h-56 w-full shrink-0 rounded-lg border object-contain sm:h-48 sm:w-auto sm:object-cover"
          />
        ) : (
          <div className="flex h-48 w-full shrink-0 items-center justify-center rounded-lg border bg-muted sm:w-32">
            <BookOpenIcon className="size-10 text-muted-foreground/40" />
          </div>
        )}

        {/* Info */}
        <div className="flex flex-col justify-center space-y-3">
          <div>
            <h1 className="text-2xl leading-tight font-light tracking-tight">
              {book.title || book.fileName}
            </h1>
            <span className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs tracking-wide text-muted-foreground uppercase">
              {book.type}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{book.fileName}</p>

          {/* Read button */}
          <Button
            className="w-fit gap-2"
            onClick={() =>
              navigate({ search: (prev) => ({ ...prev, view: "read" }) })
            }
          >
            <BookOpenTextIcon className="size-4" />
            {progressPct != null && progressPct > 0
              ? `Continue reading (${progressPct}%)`
              : "Read book"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">Stats</h2>
        <dl className="space-y-2">
          <div className="flex justify-between text-sm">
            <dt className="text-muted-foreground">Sentences (approx.)</dt>
            <dd className="font-medium tabular-nums">
              {countLoading
                ? "Counting…"
                : count != null
                  ? count.toLocaleString()
                  : "—"}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-muted-foreground">File type</dt>
            <dd className="font-medium uppercase">{book.type}</dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-muted-foreground">File name</dt>
            <dd className="max-w-[60%] truncate text-right font-medium">
              {book.fileName}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
