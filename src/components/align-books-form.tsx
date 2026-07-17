import type { AlignProgressEvent, RegexRule } from "@/lib/alignment-pipeline"
import { extractAndSplit } from "@/lib/alignment-pipeline"
import { db } from "@/lib/db"
import { extractEpubContent } from "@/lib/epub"
import { extractPdfContent } from "@/lib/pdf"
import { splitIntoSentences } from "@/lib/sentence-splitter"
import { addAlignment } from "@/store/alignments"
import type {
  AlignedPair,
  AlignmentMeta,
  AlignmentResult,
} from "@/types/alignment"
import type { Book } from "@/types/book"
import {
  getStoredDevice,
  getStoredMaxSentences,
  getStoredModelId,
} from "@/lib/user-settings"
import {
  checkModelCached,
  detectWebGPU,
  downloadModel,
  MODEL_REGISTRY,
  resolveDevice,
} from "@/utils/model"
import { Link, useNavigate } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import {
  ArrowsLeftRight,
  CaretDown,
  CaretUp,
  Question,
  Trash,
  Warning,
} from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import AlignmentWorker from "@/workers/alignment.worker?worker"
import type { AlignWorkerOutput } from "@/workers/alignment.worker"
import { Button } from "./ui/button"

const LANGUAGES = [
  { code: "ja", label: "Japanese" },
  { code: "en", label: "English" },
  { code: "zh", label: "Chinese (Simplified)" },
  { code: "zh-tw", label: "Chinese (Traditional)" },
  { code: "ko", label: "Korean" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "und", label: "Other" },
]

const PHASE_LABELS: Record<string, string> = {
  extracting_source: "Extracting source text…",
  extracting_target: "Extracting target text…",
  splitting: "Splitting into sentences…",
  embedding_source: "Embedding source sentences…",
  embedding_target: "Embedding target sentences…",
  computing_similarity: "Computing similarity matrix…",
  aligning: "Running alignment algorithm…",
}

/** Asynchronously extract + split a book to get its sentence count. */
function useSentenceCount(book: Book | undefined, lang: string) {
  const [count, setCount] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)

  useEffect(() => {
    if (!book) {
      setCount(null)
      return
    }

    let cancelled = false
    setCounting(true)
    setCount(null)

    async function run() {
      try {
        // book is defined here — we returned early above if it wasn't
        const paras =
          book!.type === "epub"
            ? await extractEpubContent(book!.fileBlob)
            : await extractPdfContent(book!.fileBlob)
        if (cancelled) return

        // Use a high cap so we get the real total, not the alignment cap
        const { records } = splitIntoSentences(paras, lang, 100_000)
        if (!cancelled) setCount(records.length)
      } catch {
        // silently ignore — count stays null
      } finally {
        if (!cancelled) setCounting(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [book?.id, lang])

  return { count, counting }
}

export function AlignBooksForm() {
  const navigate = useNavigate()
  const books = useLiveQuery(() => db.books.toArray(), []) ?? []

  const [srcBookId, setSrcBookId] = useState("")
  const [tgtBookId, setTgtBookId] = useState("")
  const [srcLang, setSrcLang] = useState("ja")
  const [tgtLang, setTgtLang] = useState("en")
  const [modelId, setModelId] = useState(() => getStoredModelId())
  const [maxSentences, setMaxSentences] = useState(() =>
    getStoredMaxSentences()
  )
  const [device, setDevice] = useState<"webgpu" | "wasm">("wasm")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [regexRules, setRegexRules] = useState<RegexRule[]>([])

  // Resolve device on mount
  useEffect(() => {
    const pref = getStoredDevice()
    if (pref === "wasm") {
      setDevice("wasm")
    } else if (pref === "webgpu") {
      setDevice(detectWebGPU() ? "webgpu" : "wasm")
    } else {
      setDevice(resolveDevice("auto"))
    }
  }, [])

  // Track which models are cached
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set())
  const [dlActive, setDlActive] = useState<string | null>(null)
  const [dlProgress, setDlProgress] = useState<Record<string, number>>({})

  useEffect(() => {
    Promise.all(
      MODEL_REGISTRY.map(async (m) => ({
        id: m.id,
        cached: await checkModelCached(m.id),
      }))
    ).then((results) => {
      setCachedIds(new Set(results.filter((r) => r.cached).map((r) => r.id)))
    })
  }, [])

  const anyModelCached = cachedIds.size > 0

  async function handleDownloadModel(id: string) {
    setDlActive(id)
    setDlProgress((p) => ({ ...p, [id]: 0 }))
    try {
      await downloadModel(id, "auto", (info) => {
        if (info.status === "progress") {
          setDlProgress((p) => ({
            ...p,
            [id]: Math.round(info.progress ?? 0),
          }))
        }
      })
      setCachedIds((prev) => new Set([...prev, id]))
      setModelId(id)
    } finally {
      setDlActive(null)
    }
  }

  const [isAligning, setIsAligning] = useState(false)
  const [autoDownloading, setAutoDownloading] = useState(false)
  const [autoDownloadPct, setAutoDownloadPct] = useState(0)
  const [progress, setProgress] = useState<AlignProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [truncationWarning, setTruncationWarning] = useState<string | null>(
    null
  )

  const cancelRef = useRef<(() => void) | null>(null)

  const srcBook = books.find((b) => b.id === srcBookId) ?? null
  const tgtBook = books.find((b) => b.id === tgtBookId) ?? null
  const canAlign =
    !!srcBook && !!tgtBook && srcBookId !== tgtBookId && !isAligning

  // MiniLM L12 is the fallback auto-download model (smallest, 470 MB)
  const AUTO_DL_MODEL = MODEL_REGISTRY.find((m) => m.label === "MiniLM L12")!

  function handleCancel() {
    cancelRef.current?.()
  }

  async function handleAlign() {
    if (!srcBook || !tgtBook) return
    setIsAligning(true)
    setError(null)
    setProgress(null)
    setTruncationWarning(null)

    const alignStart = Date.now()

    let isCancelled = false
    let workerCancel: (() => void) | null = null

    cancelRef.current = () => {
      isCancelled = true
      workerCancel?.()
    }

    // Auto-download MiniLM L12 when no model is cached yet
    let effectiveModelId = modelId
    if (!anyModelCached) {
      setAutoDownloading(true)
      setAutoDownloadPct(0)
      try {
        await downloadModel(AUTO_DL_MODEL.id, "auto", (info) => {
          if (info.status === "progress")
            setAutoDownloadPct(Math.round(info.progress ?? 0))
        })
        setCachedIds((prev) => new Set([...prev, AUTO_DL_MODEL.id]))
        setModelId(AUTO_DL_MODEL.id)
        effectiveModelId = AUTO_DL_MODEL.id
      } catch {
        setError(
          "Failed to download model. Check your connection and try again."
        )
        setIsAligning(false)
        setAutoDownloading(false)
        return
      }
      setAutoDownloading(false)
      if (isCancelled) {
        setIsAligning(false)
        return
      }
    }

    try {
      const validRules = regexRules.filter((r) => {
        if (!r.pattern) return false
        try {
          new RegExp(r.pattern)
          return true
        } catch {
          return false
        }
      })

      const {
        srcRecords,
        tgtRecords,
        srcParas,
        tgtParas,
        srcTruncated,
        tgtTruncated,
      } = await extractAndSplit({
        srcBlob: srcBook.fileBlob,
        srcType: srcBook.type,
        srcLang,
        tgtBlob: tgtBook.fileBlob,
        tgtType: tgtBook.type,
        tgtLang,
        maxSentences,
        preprocessRules: validRules,
        onProgress: (e) => setProgress(e),
      })

      if (srcTruncated || tgtTruncated) {
        const sides = [srcTruncated && "source", tgtTruncated && "target"]
          .filter(Boolean)
          .join(" and ")
        setTruncationWarning(
          `The ${sides} book was capped at ${maxSentences.toLocaleString()} sentences — some content was excluded from the alignment. Raise "Max sentences" in Advanced to include more.`
        )
      }

      if (isCancelled) return

      const pairs = await new Promise<AlignedPair[]>((resolve, reject) => {
        const worker = new AlignmentWorker()

        workerCancel = () => {
          worker.terminate()
          reject(new DOMException("Alignment cancelled.", "AbortError"))
        }

        worker.onmessage = (e: MessageEvent<AlignWorkerOutput>) => {
          if (e.data.type === "progress") setProgress(e.data.event)
          if (e.data.type === "done") {
            worker.terminate()
            resolve(e.data.pairs)
          }
          if (e.data.type === "error") {
            worker.terminate()
            reject(new Error(e.data.message))
          }
        }

        worker.onerror = (e) => {
          worker.terminate()
          reject(new Error(e.message ?? "Worker error"))
        }

        console.log(
          `[PT] align: dispatching | model=${effectiveModelId} | device=${device} | src=${srcRecords.length} | tgt=${tgtRecords.length}`
        )
        worker.postMessage({
          type: "align",
          params: {
            srcRecords,
            tgtRecords,
            modelId: effectiveModelId,
            gapPenalty: 0,
            device,
          },
        })
      })

      const aligned_count = pairs.filter(
        (p) => p.alignment_type === "1:1"
      ).length
      const src_gap_count = pairs.filter(
        (p) => p.alignment_type === "1:0"
      ).length
      const tgt_gap_count = pairs.filter(
        (p) => p.alignment_type === "0:1"
      ).length

      const result: AlignmentResult = {
        pairs,
        src_lang: srcLang,
        tgt_lang: tgtLang,
        total_src_sentences: srcRecords.length,
        total_tgt_sentences: tgtRecords.length,
        aligned_count,
        src_gap_count,
        tgt_gap_count,
        source_paragraphs: srcParas,
        target_paragraphs: tgtParas,
      }

      const meta: AlignmentMeta = {
        modelId,
        device,
        dtype: "fp32",
        durationMs: Date.now() - alignStart,
      }

      const id = await addAlignment(
        srcBook.id,
        tgtBook.id,
        srcBook.title,
        tgtBook.title,
        result,
        meta
      )

      navigate({
        to: "/alignment/$id",
        params: { id },
        search: {
          view: "popover",
          pageNumHidden: false,
          charCount: 0,
          totalChars: 0,
        },
      })
    } catch (err) {
      if (!isCancelled) {
        setError(err instanceof Error ? err.message : "Alignment failed.")
      }
    } finally {
      cancelRef.current = null
      setIsAligning(false)
      setProgress(null)
    }
  }

  const progressPct =
    progress?.current != null && progress?.total != null
      ? Math.round((progress.current / progress.total) * 100)
      : null

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-lg font-semibold">Align books</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            device === "webgpu"
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {device === "webgpu" ? "GPU" : "WASM"}
        </span>
      </div>

      {/* ── Book + language selectors ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <BookLangSelector
          label="Source"
          hint="The language you are learning"
          books={books}
          selectedId={srcBookId}
          onSelectId={setSrcBookId}
          lang={srcLang}
          onSelectLang={setSrcLang}
          disabledId={tgtBookId}
        />
        <div className="flex items-center justify-center sm:pt-6">
          <button
            type="button"
            title="Swap source and target"
            onClick={() => {
              setSrcBookId(tgtBookId)
              setTgtBookId(srcBookId)
              setSrcLang(tgtLang)
              setTgtLang(srcLang)
            }}
            className="rounded-full border bg-background p-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowsLeftRight className="size-4" />
          </button>
        </div>
        <BookLangSelector
          label="Target"
          hint="The language you already know / are translating to"
          books={books}
          selectedId={tgtBookId}
          onSelectId={setTgtBookId}
          lang={tgtLang}
          onSelectLang={setTgtLang}
          disabledId={srcBookId}
        />
      </div>

      {/* ── Advanced section ── */}
      <div className="mt-4">
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? (
            <CaretUp className="size-4" />
          ) : (
            <CaretDown className="size-4" />
          )}
          Advanced
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-5">
            {/* Model selector */}
            <div>
              <p className="mb-2 text-sm font-medium">Embedding model</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {MODEL_REGISTRY.map((m) => {
                  const isActive = modelId === m.id
                  const isDownloading = dlActive === m.id
                  const prog = dlProgress[m.id] ?? 0
                  const isCached = cachedIds.has(m.id)

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModelId(m.id)}
                      disabled={isDownloading}
                      className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border bg-background hover:bg-muted"
                      } ${isDownloading ? "pointer-events-none" : ""}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{m.label}</span>
                        {m.recommended && (
                          <span className="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                            Recommended
                          </span>
                        )}
                        {isCached && (
                          <span className="rounded border border-primary/30 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                            Cached
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {m.description}
                      </span>

                      {/* Per-model download button */}
                      {!isCached && (
                        <div
                          className="mt-2 border-t border-border/40 pt-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isDownloading ? (
                            <div className="space-y-1">
                              <div className="h-1 overflow-hidden rounded-full bg-muted-foreground/20">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-200"
                                  style={{ width: `${prog}%` }}
                                />
                              </div>
                              <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                                {prog}%
                              </p>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={dlActive !== null}
                              onClick={() => handleDownloadModel(m.id)}
                              className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Download (~{m.sizeMb} MB)
                            </button>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Want more options?{" "}
                <Link
                  to="/settings"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Manage models in Settings
                </Link>
              </p>
            </div>

            {/* Max sentences */}
            <div className="flex items-center gap-3">
              <label
                htmlFor="max-sentences"
                className="text-sm text-muted-foreground"
              >
                Max sentences per book
              </label>
              <input
                id="max-sentences"
                type="number"
                min={10}
                max={20_000}
                step={500}
                value={maxSentences}
                onChange={(e) => setMaxSentences(Number(e.target.value))}
                className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
              />
            </div>

            {/* Regex preprocessing */}
            <div>
              <p className="mb-2 text-sm font-medium">
                Text preprocessing (regex)
              </p>
              <div className="space-y-1.5">
                {regexRules.map((rule, i) => {
                  let valid = true
                  try {
                    if (rule.pattern) new RegExp(rule.pattern)
                  } catch {
                    valid = false
                  }
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        aria-label="Pattern"
                        placeholder="Pattern"
                        value={rule.pattern}
                        onChange={(e) =>
                          setRegexRules((prev) =>
                            prev.map((r, j) =>
                              j === i ? { ...r, pattern: e.target.value } : r
                            )
                          )
                        }
                        className={`w-36 rounded-md border bg-background px-2 py-1 font-mono text-xs ${
                          !valid ? "border-destructive" : ""
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">→</span>
                      <input
                        aria-label="Replacement"
                        placeholder="Replacement"
                        value={rule.replacement}
                        onChange={(e) =>
                          setRegexRules((prev) =>
                            prev.map((r, j) =>
                              j === i
                                ? { ...r, replacement: e.target.value }
                                : r
                            )
                          )
                        }
                        className="w-28 rounded-md border bg-background px-2 py-1 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRegexRules((prev) =>
                            prev.filter((_, j) => j !== i)
                          )
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Remove rule"
                      >
                        <Trash className="size-3.5" />
                      </button>
                      {!valid && (
                        <span className="text-xs text-destructive">
                          Invalid regex
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() =>
                  setRegexRules((prev) => [
                    ...prev,
                    { pattern: "", replacement: "" },
                  ])
                }
                className="mt-2 text-xs text-primary hover:underline"
              >
                + Add rule
              </button>
              <p className="mt-1 text-xs text-muted-foreground">
                Patterns are applied globally to extracted text before
                alignment.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Progress ── */}
      {isAligning && (
        <div className="mt-5 space-y-1">
          <p className="text-sm text-muted-foreground">
            {autoDownloading
              ? `Downloading ${AUTO_DL_MODEL.label} model…`
              : progress
                ? PHASE_LABELS[progress.phase]
                : "Starting…"}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: `${autoDownloading ? autoDownloadPct : (progressPct ?? 0)}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {autoDownloading
              ? `${autoDownloadPct}%`
              : progressPct != null
                ? `${progressPct}%`
                : null}
          </p>
        </div>
      )}

      {/* ── Truncation warning ── */}
      {truncationWarning && (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <Warning className="mt-0.5 size-4 shrink-0" />
          {truncationWarning}
        </p>
      )}

      {/* ── Error ── */}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* ── Align / Cancel buttons ── */}
      <div className="mt-5 space-y-2">
        <div className="flex items-center gap-2">
          <Button
            className="w-full sm:w-auto"
            disabled={!canAlign}
            onClick={handleAlign}
          >
            {isAligning
              ? autoDownloading
                ? "Downloading model…"
                : "Aligning…"
              : "Align books"}
          </Button>
          {isAligning && (
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
        {!anyModelCached && !isAligning && canAlign && (
          <p className="text-xs text-muted-foreground">
            No model downloaded yet — clicking Align will download{" "}
            <span className="font-medium text-foreground">
              {AUTO_DL_MODEL.label}
            </span>{" "}
            (~{AUTO_DL_MODEL.sizeMb} MB) first. To use a different model, open{" "}
            <button
              type="button"
              className="font-medium text-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAdvanced(true)}
            >
              Advanced
            </button>
            .
          </p>
        )}
      </div>
    </div>
  )
}

// ── Sub-component: one side's book + language picker ────────────────────────

interface BookLangSelectorProps {
  label: string
  hint: string
  books: Book[]
  selectedId: string
  onSelectId: (id: string) => void
  lang: string
  onSelectLang: (lang: string) => void
  disabledId: string
}

function BookLangSelector({
  label,
  hint,
  books,
  selectedId,
  onSelectId,
  lang,
  onSelectLang,
  disabledId,
}: BookLangSelectorProps) {
  const selected = books.find((b) => b.id === selectedId)
  const { count, counting } = useSentenceCount(selected, lang)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium">{label} book</p>
        <div className="group relative flex items-center">
          <Question className="size-3.5 cursor-default text-muted-foreground/50 hover:text-muted-foreground" />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            <span className="whitespace-nowrap">{hint}</span>
            {/* arrow */}
            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-foreground" />
          </div>
        </div>
      </div>

      <select
        value={selectedId}
        onChange={(e) => onSelectId(e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        <option value="">— select a book —</option>
        {books.map((b) => (
          <option key={b.id} value={b.id} disabled={b.id === disabledId}>
            {b.title || b.fileName}
          </option>
        ))}
      </select>

      {selected?.coverDataUrl && (
        <img
          src={selected.coverDataUrl}
          alt={selected.title}
          className="h-24 w-auto rounded object-cover"
        />
      )}

      <select
        value={lang}
        onChange={(e) => onSelectLang(e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>

      {selected && (
        <p className="text-xs text-muted-foreground">
          {counting
            ? "Counting sentences…"
            : count != null
              ? `~${count.toLocaleString()} sentences`
              : null}
        </p>
      )}
    </div>
  )
}
