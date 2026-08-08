import { extractEpubContent } from "@/lib/epub"
import { extractPdfContent } from "@/lib/pdf"
import { getBookProgress, setBookProgress } from "@/lib/reading-progress"
import { splitIntoSentences } from "@/lib/sentence-splitter"
import { extractTxtContent } from "@/lib/txt"
import { getStoredFontSize } from "@/lib/user-settings"
import { getBook } from "@/store/books"
import type { Book } from "@/types/book"
import type { ImageAsset, SourceParagraph } from "@/types/alignment"
import {
  PaginatedReader,
  ReaderSkeleton,
  type PaginatedReaderHandle,
} from "@/components/paginated-reader"
import { ReaderSearch, type SearchResult } from "@/components/reader-search"
import { Button } from "@/components/ui/button"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { BookOpen, BookOpenText, CaretLeft } from "@phosphor-icons/react"
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
}: {
  para: SourceParagraph
  pIdx: number
}) {
  return (
    <div
      data-para-idx={pIdx}
      className="px-12 sm:px-16 lg:px-4"
      style={{
        breakInside: "avoid",
        marginBottom: "1.5rem",
        maxWidth: "56rem",
        marginInline: "auto",
      }}
    >
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
        const raw =
          book.type === "epub"
            ? await extractEpubContent(book.fileBlob)
            : book.type === "pdf"
              ? await extractPdfContent(book.fileBlob)
              : await extractTxtContent(book.fileBlob)
        if (cancelled) return
        // Filter empty paragraphs; re-index so data-para-idx is contiguous
        setParagraphs(
          raw
            .filter((p) => p.text.trim() || p.images.length > 0)
            .map((p, i) => ({ ...p, para_idx: i }))
        )
      } catch (err) {
        if (!cancelled)
          setExtractError(
            err instanceof Error ? err.message : "Failed to extract text."
          )
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
        <BookParagraphBlock key={idx} para={para} pIdx={idx} />
      ))}
    </PaginatedReader>
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
  const [fontSize] = useState(() => getStoredFontSize())
  const { count, loading: countLoading } = useSentenceCount(
    view === "detail" ? book : null
  )

  useEffect(() => {
    getBook(id).then((b) => {
      if (!b) setNotFoundState(true)
      else setBook(b)
    })
  }, [id])

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
          <CaretLeft className="size-4" /> Back to books
        </Link>
      </div>
    )
  }

  if (!book) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-muted-foreground">Loading…</p>
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
          <CaretLeft className="size-3.5" /> Detail
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
        <CaretLeft className="size-4" /> Books
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Cover */}
        {book.coverDataUrl ? (
          <img
            src={book.coverDataUrl}
            alt={book.title}
            className="h-56 w-full flex-shrink-0 rounded-lg border object-contain sm:h-48 sm:w-auto sm:object-cover"
          />
        ) : (
          <div className="flex h-48 w-full flex-shrink-0 items-center justify-center rounded-lg border bg-muted sm:w-32">
            <BookOpen className="size-10 text-muted-foreground/40" />
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
            <BookOpenText className="size-4" />
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
