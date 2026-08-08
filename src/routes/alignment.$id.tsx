import {
  buildAlignmentParagraphs,
  numberParagraphPairs,
  searchAlignmentParagraphs,
  type ParagraphData,
} from "@/lib/alignment-paragraphs"
import { EQUIVALENCE_PALETTE } from "@/lib/equivalence-palette"
import {
  PaginatedReader,
  ReaderSkeleton,
  type PaginatedReaderHandle,
} from "@/components/paginated-reader"
import { ReaderSearch } from "@/components/reader-search"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { downloadAlignmentEpub } from "@/lib/export-epub"
import { downloadAlignmentTsv } from "@/lib/export-tsv"
import {
  getAlignmentProgress,
  getAlignmentViewPrefs,
  setAlignmentProgress,
  setAlignmentViewPrefs,
} from "@/lib/reading-progress"
import {
  getStoredFontSize,
  getStoredImageMode,
  getStoredLineNumbers,
  getStoredShowEquivalence,
  setStoredImageMode,
  setStoredLineNumbers,
  setStoredShowEquivalence,
  type ImageMode,
} from "@/lib/user-settings"
import { getAlignment } from "@/store/alignments"
import type {
  AlignedPair,
  AlignmentMeta,
  AlignmentRecord,
} from "@/types/alignment"
import { MODEL_REGISTRY } from "@/utils/model"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import {
  ArrowsLeftRight,
  CircleNotch,
  DotsThree,
  Info,
  X,
} from "@phosphor-icons/react"
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"

type Tab = "side-by-side" | "popover"

interface AlignmentSearchParams {
  view: Tab | undefined
  pageNumHidden: boolean | undefined
  charCount: number
  totalChars: number
}

const MAX_SEARCH_RESULTS = 30

function swapRecord(record: AlignmentRecord): AlignmentRecord {
  return {
    ...record,
    result: {
      ...record.result,
      src_lang: record.result.tgt_lang,
      tgt_lang: record.result.src_lang,
      source_paragraphs: record.result.target_paragraphs,
      target_paragraphs: record.result.source_paragraphs,
      pairs: record.result.pairs.map((p) => ({
        ...p,
        src_text: p.tgt_text,
        tgt_text: p.src_text,
        src_para_idx: p.tgt_para_idx,
        tgt_para_idx: p.src_para_idx,
        src_sent_idx: p.tgt_sent_idx,
        tgt_sent_idx: p.src_sent_idx,
        src_global_idx: p.tgt_global_idx,
        tgt_global_idx: p.src_global_idx,
        src_images: p.tgt_images,
        tgt_images: p.src_images,
        alignment_type:
          p.alignment_type === "1:0"
            ? "0:1"
            : p.alignment_type === "0:1"
              ? "1:0"
              : p.alignment_type,
      })),
    },
  }
}

export const Route = createFileRoute("/alignment/$id")({
  validateSearch: (search: Record<string, unknown>): AlignmentSearchParams => ({
    // Left undefined when absent from the URL (rather than defaulting) so the
    // component can tell "not specified — fall back to the saved
    // preference" apart from "explicitly set via the URL".
    view:
      search.view === "side-by-side" || search.view === "popover"
        ? search.view
        : undefined,
    pageNumHidden:
      typeof search.pageNumHidden === "boolean"
        ? search.pageNumHidden
        : undefined,
    charCount:
      typeof search.charCount === "number" && search.charCount >= 0
        ? Math.floor(search.charCount)
        : 0,
    totalChars:
      typeof search.totalChars === "number" && search.totalChars > 0
        ? Math.floor(search.totalChars)
        : 0,
  }),
  component: AlignmentPage,
})

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function metaModelLabel(meta: AlignmentMeta): string {
  return (
    MODEL_REGISTRY.find((m) => m.id === meta.modelId)?.label ?? meta.modelId
  )
}

function formatSavedAt(savedAt: number): string {
  const diffMs = Date.now() - savedAt
  const diffS = Math.floor(diffMs / 1000)
  if (diffS < 60) return "Last saved: just now"
  const diffMin = Math.floor(diffS / 60)
  if (diffMin < 60) return `Last saved: ${diffMin} min ago`
  return `Last saved: ${new Date(savedAt).toLocaleTimeString()}`
}

function AlignmentPage() {
  const { id } = Route.useParams()
  const { view, pageNumHidden, charCount, totalChars } = Route.useSearch()
  const navigate = useNavigate({ from: "/alignment/$id" })
  const record = useLiveQuery(() => getAlignment(id), [id])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [fontSize] = useState(() => getStoredFontSize())
  const [imageMode, setImageMode] = useState<ImageMode>(() =>
    getStoredImageMode()
  )
  const [showLineNumbers, setShowLineNumbers] = useState(() =>
    getStoredLineNumbers()
  )
  const [showEquivalence, setShowEquivalence] = useState(() =>
    getStoredShowEquivalence()
  )
  const [swapped, setSwapped] = useState(false)
  const [exporting, setExporting] = useState<"tsv" | "epub" | null>(null)
  // Tracks when charCount last changed in this session — used for "last saved" display.
  const [savedAt, setSavedAt] = useState<number | null>(null)
  useEffect(() => {
    if (charCount > 0) setSavedAt(Date.now())
  }, [charCount])

  function toggleLineNumbers() {
    setShowLineNumbers((v) => {
      const next = !v
      setStoredLineNumbers(next)
      return next
    })
  }

  function toggleEquivalence() {
    setShowEquivalence((v) => {
      const next = !v
      setStoredShowEquivalence(next)
      return next
    })
  }

  if (record === undefined) {
    return (
      <div
        className="overflow-hidden"
        style={{ height: "calc(100svh - 56px)", padding: 32 }}
      >
        <div className="mx-auto max-w-3xl">
          <ReaderSkeleton fontSize={fontSize} />
        </div>
      </div>
    )
  }

  if (record === null) {
    return (
      <div className="flex min-h-[calc(100svh-56px)] items-center justify-center">
        <p className="text-muted-foreground">Alignment not found.</p>
      </div>
    )
  }

  const displayRecord = swapped ? swapRecord(record) : record
  const { result } = record
  const matchPct =
    result.pairs.length > 0
      ? Math.round((result.aligned_count / result.pairs.length) * 100)
      : 0
  const date = new Date(record.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  // Resolve effective view/pageNumHidden: URL param wins when explicitly
  // set, otherwise fall back to the per-alignment saved preference — same
  // two-layer restore pattern reading progress (charCount) already uses.
  const recordId = record.id
  const viewPrefs = getAlignmentViewPrefs(recordId)
  const effectiveView: Tab = view ?? viewPrefs?.view ?? "popover"
  const effectivePageNumHidden =
    pageNumHidden ?? viewPrefs?.pageNumHidden ?? false

  function setView(v: Tab) {
    navigate({ search: (prev) => ({ ...prev, view: v }) })
    setAlignmentViewPrefs(recordId, { view: v })
  }

  function togglePageNum() {
    const next = !effectivePageNumHidden
    navigate({ search: (prev) => ({ ...prev, pageNumHidden: next }) })
    setAlignmentViewPrefs(recordId, { pageNumHidden: next })
  }

  return (
    <div
      className="relative flex flex-col"
      style={{ height: "calc(100svh - 56px)" }}
    >
      {/* ── Content ─────────────────────────────────────── */}
      {effectiveView === "side-by-side" ? (
        <SideBySideView
          record={displayRecord}
          fontSize={fontSize}
          pageNumHidden={effectivePageNumHidden}
          onTogglePageNum={togglePageNum}
          imageMode={imageMode}
          showLineNumbers={showLineNumbers}
          showEquivalence={showEquivalence}
        />
      ) : (
        <PopoverView
          record={displayRecord}
          fontSize={fontSize}
          pageNumHidden={effectivePageNumHidden}
          onTogglePageNum={togglePageNum}
          imageMode={imageMode}
        />
      )}

      {/* ── Floating info trigger (bottom-right) ────────── */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="absolute right-4 bottom-4 z-20 flex size-10 items-center justify-center rounded-full bg-background shadow-md ring-1 ring-border hover:bg-muted"
        aria-label="Open details"
      >
        <Info className="size-4 text-muted-foreground" />
      </button>

      {/* ── Drawer (vaul, right-side) ────────────────────── */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="right">
        <DrawerContent className="flex flex-col">
          <DrawerHeader className="relative flex-row items-center justify-between border-b">
            <DrawerTitle>Details</DrawerTitle>
            <DrawerClose className="absolute top-1/2 right-4 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </DrawerClose>
          </DrawerHeader>

          {/* Drawer body */}
          <div className="flex-1 space-y-6 overflow-auto p-4">
            {/* Titles */}
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{record.sourceBookTitle}</p>
              <p className="text-xs text-muted-foreground">
                ↔ {record.targetBookTitle}
              </p>
              <p className="pt-1 text-xs text-muted-foreground">
                {result.src_lang.toUpperCase()} →{" "}
                {result.tgt_lang.toUpperCase()}
                &ensp;·&ensp;{date}
              </p>
            </div>

            {/* Stats */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Stats
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Stat
                  label="Matched"
                  value={`${result.aligned_count.toLocaleString()} (${matchPct}%)`}
                  accent="text-primary"
                />
                <Stat
                  label="Src gaps"
                  value={result.src_gap_count.toLocaleString()}
                />
                <Stat
                  label="Tgt gaps"
                  value={result.tgt_gap_count.toLocaleString()}
                />
                <Stat
                  label="Total pairs"
                  value={result.pairs.length.toLocaleString()}
                />
                <Stat
                  label="Src sentences"
                  value={result.total_src_sentences.toLocaleString()}
                />
                <Stat
                  label="Tgt sentences"
                  value={result.total_tgt_sentences.toLocaleString()}
                />
              </div>
            </div>

            {/* Origin / model metadata */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Origin
              </p>
              {record.importedFrom === "tsv" ? (
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                    TSV import
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Imported from an external TSV file
                  </span>
                </div>
              ) : record.meta ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Model</p>
                    <p className="text-sm font-medium">
                      {metaModelLabel(record.meta)}
                    </p>
                  </div>
                  <Stat
                    label="Device"
                    value={record.meta.device.toUpperCase()}
                  />
                  <Stat label="Precision" value={record.meta.dtype} />
                  <Stat
                    label="Duration"
                    value={formatDuration(record.meta.durationMs)}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Generated by alignment pipeline
                </p>
              )}
            </div>

            {/* View mode */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                View
              </p>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {(["side-by-side", "popover"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setView(t)}
                    className={`flex-1 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                      effectiveView === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "side-by-side" ? "Side by side" : "Popover"}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction swap */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Direction
              </p>
              <button
                type="button"
                onClick={() => setSwapped((s) => !s)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                  swapped
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>
                  {swapped
                    ? `${result.tgt_lang.toUpperCase()} → ${result.src_lang.toUpperCase()}`
                    : `${result.src_lang.toUpperCase()} → ${result.tgt_lang.toUpperCase()}`}
                </span>
                <ArrowsLeftRight className="size-4" />
              </button>
            </div>

            {/* Display */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Display
              </p>
              <ToggleSwitch
                checked={!effectivePageNumHidden}
                onChange={togglePageNum}
                label="Page number"
              />
            </div>

            {/* Side-by-side only */}
            {effectiveView === "side-by-side" && (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Side-by-side
                </p>
                <ToggleSwitch
                  checked={showLineNumbers}
                  onChange={toggleLineNumbers}
                  label="Line numbers"
                />
                <ToggleSwitch
                  checked={showEquivalence}
                  onChange={toggleEquivalence}
                  label="Show equivalence"
                />
              </div>
            )}

            {/* Images */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Images
              </p>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                {(
                  [
                    ["source", "Source"],
                    ["target", "Target"],
                    ["both", "Both"],
                    ["none", "None"],
                  ] as [ImageMode, string][]
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setImageMode(m)
                      setStoredImageMode(m)
                    }}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      imageMode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reading progress */}
            {totalChars > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Reading progress
                </p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">
                      {charCount.toLocaleString()} /{" "}
                      {totalChars.toLocaleString()} chars
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round((charCount / totalChars) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{
                        width: `${Math.round((charCount / totalChars) * 100)}%`,
                      }}
                    />
                  </div>
                  {savedAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatSavedAt(savedAt)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                  onClick={() =>
                    navigate({
                      replace: true,
                      search: (prev) => ({
                        ...prev,
                        charCount: 0,
                        totalChars: 0,
                      }),
                    })
                  }
                >
                  Clear progress
                </button>
              </div>
            )}

            {/* Export */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Export
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={exporting !== null}
                  onClick={async () => {
                    setExporting("tsv")
                    await Promise.resolve()
                    try {
                      downloadAlignmentTsv(displayRecord)
                    } finally {
                      setExporting(null)
                    }
                  }}
                >
                  {exporting === "tsv" ? (
                    <>
                      <CircleNotch className="mr-1.5 size-3.5 animate-spin" />
                      Preparing TSV…
                    </>
                  ) : (
                    "Export TSV"
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={exporting !== null}
                  onClick={async () => {
                    setExporting("epub")
                    try {
                      await downloadAlignmentEpub(displayRecord, imageMode)
                    } finally {
                      setExporting(null)
                    }
                  }}
                >
                  {exporting === "epub" ? (
                    <>
                      <CircleNotch className="mr-1.5 size-3.5 animate-spin" />
                      Preparing EPUB…
                    </>
                  ) : (
                    "Export EPUB"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

// ── Side-by-side view (paginated, two columns) ────────────────────────────────
// Shares the exact same PaginatedReader, paragraph data, save-progress cursor,
// and search machinery as PopoverView — the only difference is that each
// paragraph renders as a source/target column pair instead of a single
// popover-interactive column.

// A wide spread of hues (warm + blue/violet), cycled per pair so adjacent
// sentences are easy to tell apart at a glance — a flat two-tone alternation
// reads as "every other line" rather than "these two lines are the same
// pair." Warm and cool entries alternate so neighboring pair numbers never
// land on two similar-looking hues. The same hue always lands on both sides
// of a pair since both spans are keyed off the same global pair number.
// Unmatched pairs (no counterpart on the other side) never get a color —
// there's nothing to link them to.
function SideBySideSentence({
  text,
  number,
  showLineNumbers,
  showEquivalence,
  hasMatch,
  colorIdx,
  isHovered,
  onHoverStart,
  onHoverEnd,
  isLast,
}: {
  text: string
  number: number
  showLineNumbers: boolean
  showEquivalence: boolean
  hasMatch: boolean
  colorIdx: number
  isHovered: boolean
  onHoverStart: () => void
  onHoverEnd: () => void
  isLast: boolean
}) {
  const hasText = text.trim().length > 0
  const colorable = showEquivalence && hasMatch
  const palette = EQUIVALENCE_PALETTE[colorIdx % EQUIVALENCE_PALETTE.length]
  return (
    <span>
      <span
        onMouseEnter={colorable ? onHoverStart : undefined}
        onMouseLeave={colorable ? onHoverEnd : undefined}
        className={
          colorable
            ? `rounded-sm px-0.5 transition-colors ${isHovered ? palette.hover : palette.base}`
            : ""
        }
      >
        {showLineNumbers && (
          <sup className="mr-0.5 text-[0.65em] font-medium text-muted-foreground/70 select-none">
            {number}
          </sup>
        )}
        {hasText ? text : <span className="text-muted-foreground/40">—</span>}
      </span>
      {isLast ? "" : " "}
    </span>
  )
}

const SideBySideParagraphBlock = memo(function SideBySideParagraphBlock({
  para,
  pIdx,
  pairNumbers,
  showLineNumbers,
  showEquivalence,
}: {
  para: ParagraphData
  pIdx: number
  pairNumbers: number[]
  showLineNumbers: boolean
  showEquivalence: boolean
}) {
  // Local to this paragraph — a pair's source/target spans always live in the
  // same paragraph block, so hover state never needs to reach further than this.
  const [hoveredPairIdx, setHoveredPairIdx] = useState<number | null>(null)

  return (
    <div
      data-para-idx={pIdx}
      className="px-12 sm:px-16 lg:px-4"
      style={{
        breakInside: "avoid",
        marginBottom: "1.5rem",
        maxWidth: "72rem",
        marginInline: "auto",
      }}
    >
      {para.images.map((img) => (
        <img
          key={img.id}
          src={`data:${img.mime_type};base64,${img.data_base64}`}
          alt=""
          className="mx-auto mb-4 max-h-80 max-w-full object-contain"
        />
      ))}
      {para.pairs.length > 0 && (
        <div className="grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2">
          <p>
            {para.pairs.map((pair, pairIdx) => (
              <SideBySideSentence
                key={pairIdx}
                text={pair.src_text}
                number={pairNumbers[pairIdx]}
                showLineNumbers={showLineNumbers}
                showEquivalence={showEquivalence}
                hasMatch={!!pair.src_text.trim() && !!pair.tgt_text.trim()}
                colorIdx={pairNumbers[pairIdx] - 1}
                isHovered={hoveredPairIdx === pairIdx}
                onHoverStart={() => setHoveredPairIdx(pairIdx)}
                onHoverEnd={() => setHoveredPairIdx(null)}
                isLast={pairIdx === para.pairs.length - 1}
              />
            ))}
          </p>
          <p className="border-t pt-3 sm:border-t-0 sm:pt-0">
            {para.pairs.map((pair, pairIdx) => (
              <SideBySideSentence
                key={pairIdx}
                text={pair.tgt_text}
                number={pairNumbers[pairIdx]}
                showLineNumbers={showLineNumbers}
                showEquivalence={showEquivalence}
                hasMatch={!!pair.src_text.trim() && !!pair.tgt_text.trim()}
                colorIdx={pairNumbers[pairIdx] - 1}
                isHovered={hoveredPairIdx === pairIdx}
                onHoverStart={() => setHoveredPairIdx(pairIdx)}
                onHoverEnd={() => setHoveredPairIdx(null)}
                isLast={pairIdx === para.pairs.length - 1}
              />
            ))}
          </p>
        </div>
      )}
    </div>
  )
})

function SideBySideView({
  record,
  fontSize,
  pageNumHidden,
  onTogglePageNum,
  imageMode,
  showLineNumbers,
  showEquivalence,
}: {
  record: AlignmentRecord
  fontSize: number
  pageNumHidden: boolean
  onTogglePageNum: () => void
  imageMode: ImageMode
  showLineNumbers: boolean
  showEquivalence: boolean
}) {
  const navigate = useNavigate({ from: "/alignment/$id" })
  const { charCount: urlCharCount } = Route.useSearch()

  const readerRef = useRef<PaginatedReaderHandle>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchIdx, setSearchIdx] = useState(-1)

  const paragraphs = useMemo(
    () => buildAlignmentParagraphs(record.result, imageMode),
    [record.result, imageMode]
  )

  const pairNumbers = useMemo(
    () => numberParagraphPairs(paragraphs),
    [paragraphs]
  )

  const searchData = useMemo(
    () =>
      searchAlignmentParagraphs(paragraphs, searchQuery, MAX_SEARCH_RESULTS),
    [searchQuery, paragraphs]
  )

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

  const savedCharCount =
    urlCharCount > 0
      ? urlCharCount
      : (getAlignmentProgress(record.id)?.charCount ?? 0)

  const handleSaveProgress = useCallback(
    (charCount: number, totalChars: number) => {
      navigate({
        replace: true,
        search: (prev) => ({ ...prev, charCount, totalChars }),
      })
      setAlignmentProgress(record.id, charCount, totalChars)
    },
    [navigate, record.id]
  )

  return (
    <PaginatedReader
      ref={readerRef}
      paragraphs={paragraphs}
      savedCharCount={savedCharCount}
      fontSize={fontSize}
      pageNumHidden={pageNumHidden}
      onTogglePageNum={onTogglePageNum}
      onSaveProgress={handleSaveProgress}
      emptyMessage="No source text in this alignment."
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
      {paragraphs.map((para, pIdx) => (
        <SideBySideParagraphBlock
          key={pIdx}
          para={para}
          pIdx={pIdx}
          pairNumbers={pairNumbers[pIdx]}
          showLineNumbers={showLineNumbers}
          showEquivalence={showEquivalence}
        />
      ))}
    </PaginatedReader>
  )
}

// ── Popover view (paginated book reader) ─────────────────────────────────────

const PREV_NEXT_TRUNCATE = 80

function PairPopoverContent({
  pair,
  prevPair,
  nextPair,
}: {
  pair: AlignedPair
  prevPair?: AlignedPair | null
  nextPair?: AlignedPair | null
}) {
  const [showDetails, setShowDetails] = useState(false)
  const [prevExpanded, setPrevExpanded] = useState(false)
  const [nextExpanded, setNextExpanded] = useState(false)

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-3 pr-6">
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="absolute top-0 right-0 text-muted-foreground hover:text-foreground"
        aria-label={showDetails ? "Hide details" : "Show details"}
      >
        {showDetails ? (
          <X className="size-3.5" />
        ) : (
          <DotsThree className="size-4" />
        )}
      </button>

      <div className="space-y-2 text-base">
        {prevPair?.tgt_text.trim() && (
          <p className="text-muted-foreground opacity-30">
            <span className="italic">
              {prevExpanded || prevPair.tgt_text.length <= PREV_NEXT_TRUNCATE
                ? prevPair.tgt_text
                : prevPair.tgt_text.slice(0, PREV_NEXT_TRUNCATE)}
            </span>
            {!prevExpanded && prevPair.tgt_text.length > PREV_NEXT_TRUNCATE && (
              <button
                type="button"
                onClick={() => setPrevExpanded(true)}
                className="ml-0.5 text-muted-foreground opacity-50 hover:opacity-100"
              >
                …
              </button>
            )}
          </p>
        )}
        <p className="font-semibold italic">{pair.tgt_text}</p>
        {nextPair?.tgt_text.trim() && (
          <p className="text-muted-foreground opacity-30">
            <span className="italic">
              {nextExpanded || nextPair.tgt_text.length <= PREV_NEXT_TRUNCATE
                ? nextPair.tgt_text
                : nextPair.tgt_text.slice(0, PREV_NEXT_TRUNCATE)}
            </span>
            {!nextExpanded && nextPair.tgt_text.length > PREV_NEXT_TRUNCATE && (
              <button
                type="button"
                onClick={() => setNextExpanded(true)}
                className="ml-0.5 text-muted-foreground opacity-50 hover:opacity-100"
              >
                …
              </button>
            )}
          </p>
        )}
      </div>

      {showDetails && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Confidence:{" "}
            {pair.confidence != null
              ? (pair.confidence * 100).toFixed(1) + "%"
              : "N/A"}
          </p>
          <p>
            Source: para {pair.src_para_idx}, sent {pair.src_sent_idx} (global:{" "}
            {pair.src_global_idx})
          </p>
          <p>
            Target: para {pair.tgt_para_idx}, sent {pair.tgt_sent_idx} (global:{" "}
            {pair.tgt_global_idx})
          </p>
        </div>
      )}
    </div>
  )
}

// ── Memoized leaf: single aligned sentence span ───────────────────────────────
// Re-renders only when its own isOpen status changes (not on global openKey changes).

const PairSpan = memo(function PairSpan({
  pair,
  pIdx,
  pairIdx,
  isOpen,
  setOpenKey,
  prevPair,
  nextPair,
}: {
  pair: AlignedPair
  pIdx: number
  pairIdx: number
  isOpen: boolean
  setOpenKey: (key: string | null) => void
  prevPair?: AlignedPair | null
  nextPair?: AlignedPair | null
}) {
  const handleChange = useCallback(
    (open: boolean) => {
      setOpenKey(open ? `${pIdx}-${pairIdx}` : null)
    },
    [pIdx, pairIdx, setOpenKey]
  )

  if (pair.alignment_type !== "1:1") {
    return <span>{pair.src_text}</span>
  }

  return (
    <Popover open={isOpen} onOpenChange={handleChange}>
      <PopoverTrigger
        render={<span />}
        className={`cursor-pointer rounded-sm transition-colors hover:bg-muted/50 ${isOpen ? "bg-muted" : ""}`}
      >
        {pair.src_text}
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(calc(100vw-1rem),36rem)]"
        side="top"
        align="center"
      >
        <PairPopoverContent
          pair={pair}
          prevPair={prevPair}
          nextPair={nextPair}
        />
      </PopoverContent>
    </Popover>
  )
})

// ── Memoized paragraph block ──────────────────────────────────────────────────
// Custom comparison: skips re-render unless the openKey change belongs to this paragraph.

const ParagraphBlock = memo(
  function ParagraphBlock({
    para,
    pIdx,
    openKey,
    setOpenKey,
  }: {
    para: ParagraphData
    pIdx: number
    openKey: string | null
    setOpenKey: (key: string | null) => void
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
        {para.images.map((img) => (
          <img
            key={img.id}
            src={`data:${img.mime_type};base64,${img.data_base64}`}
            alt=""
            className="mx-auto mb-4 max-h-80 max-w-full object-contain"
          />
        ))}
        {para.pairs.length > 0 && (
          <p>
            {para.pairs.map((pair, pairIdx) => (
              <span key={pairIdx}>
                <PairSpan
                  pair={pair}
                  pIdx={pIdx}
                  pairIdx={pairIdx}
                  isOpen={openKey === `${pIdx}-${pairIdx}`}
                  setOpenKey={setOpenKey}
                  prevPair={para.pairs[pairIdx - 1]}
                  nextPair={para.pairs[pairIdx + 1]}
                />
                {pairIdx < para.pairs.length - 1 ? " " : ""}
              </span>
            ))}
          </p>
        )}
      </div>
    )
  },
  (prev, next) => {
    if (prev.para !== next.para || prev.pIdx !== next.pIdx) return false
    // Only re-render if the openKey change belongs to this paragraph
    const prevOwns = prev.openKey?.startsWith(`${prev.pIdx}-`) ?? false
    const nextOwns = next.openKey?.startsWith(`${next.pIdx}-`) ?? false
    return !prevOwns && !nextOwns
  }
)

// ── Memoized paragraph list with imperative reset handle ──────────────────────
// Owns openKey state so page navigation in PopoverView never re-renders this tree.

interface ParagraphListHandle {
  resetOpenKey: () => void
  setOpenKey: (key: string | null) => void
}

const ParagraphList = memo(
  forwardRef<ParagraphListHandle, { paragraphs: ParagraphData[] }>(
    function ParagraphList({ paragraphs }, ref) {
      const [openKey, setOpenKey] = useState<string | null>(null)

      useImperativeHandle(ref, () => ({
        resetOpenKey: () => setOpenKey(null),
        setOpenKey,
      }))

      return (
        <>
          {paragraphs.map((para, pIdx) => (
            <ParagraphBlock
              key={pIdx}
              para={para}
              pIdx={pIdx}
              openKey={openKey}
              setOpenKey={setOpenKey}
            />
          ))}
        </>
      )
    }
  )
)

function PopoverView({
  record,
  fontSize,
  pageNumHidden,
  onTogglePageNum,
  imageMode,
}: {
  record: AlignmentRecord
  fontSize: number
  pageNumHidden: boolean
  onTogglePageNum: () => void
  imageMode: ImageMode
}) {
  const navigate = useNavigate({ from: "/alignment/$id" })
  const { charCount: urlCharCount } = Route.useSearch()

  const readerRef = useRef<PaginatedReaderHandle>(null)
  const paragraphListRef = useRef<ParagraphListHandle>(null)

  // ── Search state ─────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchIdx, setSearchIdx] = useState(-1)

  const paragraphs = useMemo(
    () => buildAlignmentParagraphs(record.result, imageMode),
    [record.result, imageMode]
  )

  // Build display results + pairKeys for opening popovers
  const searchData = useMemo(() => {
    const { results, pairKeys, hasMore } = searchAlignmentParagraphs(
      paragraphs,
      searchQuery,
      MAX_SEARCH_RESULTS
    )
    return { results, pairKeys, hasMore }
  }, [searchQuery, paragraphs])

  // Reset selection (no auto-jump) when query changes
  useEffect(() => {
    setSearchIdx(-1)
  }, [searchQuery])

  function goToResult(idx: number) {
    const result = searchData.results[idx]
    if (!result) return
    readerRef.current?.jumpToParaIdx(result.paraIdx)
    const key = searchData.pairKeys[idx]
    if (key) {
      setTimeout(() => {
        paragraphListRef.current?.setOpenKey(key)
      }, 50)
    }
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
    paragraphListRef.current?.resetOpenKey()
  }

  const handlePageChange = useCallback(() => {
    paragraphListRef.current?.resetOpenKey()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────

  const savedCharCount =
    urlCharCount > 0
      ? urlCharCount
      : (getAlignmentProgress(record.id)?.charCount ?? 0)

  const handleSaveProgress = useCallback(
    (charCount: number, totalChars: number) => {
      navigate({
        replace: true,
        search: (prev) => ({ ...prev, charCount, totalChars }),
      })
      setAlignmentProgress(record.id, charCount, totalChars)
    },
    [navigate, record.id]
  )

  return (
    <PaginatedReader
      ref={readerRef}
      paragraphs={paragraphs}
      savedCharCount={savedCharCount}
      fontSize={fontSize}
      pageNumHidden={pageNumHidden}
      onTogglePageNum={onTogglePageNum}
      onSaveProgress={handleSaveProgress}
      onPageChange={handlePageChange}
      emptyMessage="No source text in this alignment."
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
      <ParagraphList ref={paragraphListRef} paragraphs={paragraphs} />
    </PaginatedReader>
  )
}

// ── Shared toggle switch (drawer settings) ────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  )
}

// ── Shared stat cell ─────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${accent ?? ""}`}>{value}</p>
    </div>
  )
}
