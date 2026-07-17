import { extractEpubMetadata } from "@/lib/epub"
import { extractAndSplit, type RegexRule } from "@/lib/alignment-pipeline"
import { addBook } from "@/store/books"
import { addAlignment } from "@/store/alignments"
import {
  checkModelCached,
  downloadModel,
  MODEL_REGISTRY,
  resolveDevice,
} from "@/utils/model"
import { getStoredMaxSentences } from "@/lib/user-settings"
import AlignmentWorker from "@/workers/alignment.worker?worker"
import type { AlignWorkerOutput } from "@/workers/alignment.worker"
import type {
  AlignedPair,
  AlignmentMeta,
  AlignmentResult,
} from "@/types/alignment"
import type { Book } from "@/types/book"
import { useNavigate } from "@tanstack/react-router"
import { BookOpen, CheckCircle, Warning, X } from "@phosphor-icons/react"
import { useState } from "react"
import { Button } from "./ui/button"

const ALICE_JP_URL = "/models/sample_books/alice_wond_jp.epub"
const ALICE_EN_URL = "/models/sample_books/alice_wond_en.epub"

// Strip leftover empty 全角 parentheses from furigana <rp> elements
const ALICE_PREPROCESS_RULES: RegexRule[] = [
  { pattern: "（）", replacement: "" },
]

const MINILM = MODEL_REGISTRY.find(
  (m) => m.id === "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
)!

const PHASE_LABELS: Record<string, string> = {
  extracting_source: "Extracting Japanese text…",
  extracting_target: "Extracting English text…",
  splitting: "Splitting into sentences…",
  embedding_source: "Embedding Japanese sentences…",
  embedding_target: "Embedding English sentences…",
  aligning: "Running alignment algorithm…",
}

type RunPhase =
  | "idle"
  | "downloading_books"
  | "extracting"
  | "downloading_model"
  | "aligning"
  | "error"

const SAMPLE_BANNER_KEY = "sample-banner-dismissed"

export function SampleAlignmentBanner() {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(SAMPLE_BANNER_KEY) === "1"
  )
  const [showModal, setShowModal] = useState(false)
  const [modelCached, setModelCached] = useState<boolean | null>(null)
  const [runPhase, setRunPhase] = useState<RunPhase>("idle")
  const [phaseLabel, setPhaseLabel] = useState("")
  const [pct, setPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [truncationNote, setTruncationNote] = useState<string | null>(null)

  const isRunning = runPhase !== "idle" && runPhase !== "error"

  async function openModal() {
    setShowModal(true)
    setModelCached(await checkModelCached(MINILM.id))
  }

  function closeModal() {
    if (isRunning) return
    setShowModal(false)
    setRunPhase("idle")
    setError(null)
    setTruncationNote(null)
    setPct(null)
    setPhaseLabel("")
  }

  async function handleRun() {
    setError(null)
    setPct(null)

    try {
      // 1. Download books
      setRunPhase("downloading_books")
      setPhaseLabel("Downloading Alice in Wonderland books…")

      const [jpResp, enResp] = await Promise.all([
        fetch(ALICE_JP_URL),
        fetch(ALICE_EN_URL),
      ])

      if (!jpResp.ok || !enResp.ok) {
        throw new Error(
          "Failed to download sample books. Check your connection."
        )
      }

      const [jpBlob, enBlob] = await Promise.all([jpResp.blob(), enResp.blob()])

      const jpFile = new File([jpBlob], "alice_wond_jp.epub", {
        type: "application/epub+zip",
      })
      const enFile = new File([enBlob], "alice_wond_en.epub", {
        type: "application/epub+zip",
      })

      // 2. Extract metadata
      setRunPhase("extracting")
      setPhaseLabel("Processing books…")

      const [jpMeta, enMeta] = await Promise.all([
        extractEpubMetadata(jpFile),
        extractEpubMetadata(enFile),
      ])

      const srcBook: Book = {
        id: crypto.randomUUID(),
        title: jpMeta.title || "Alice in Wonderland (Japanese)",
        coverDataUrl: jpMeta.coverDataUrl,
        type: "epub",
        fileName: "alice_wond_jp.epub",
        fileBlob: jpFile,
      }
      const tgtBook: Book = {
        id: crypto.randomUUID(),
        title: enMeta.title || "Alice in Wonderland (English)",
        coverDataUrl: enMeta.coverDataUrl,
        type: "epub",
        fileName: "alice_wond_en.epub",
        fileBlob: enFile,
      }

      await Promise.all([addBook(srcBook), addBook(tgtBook)])

      // 3. Download model if not cached
      const device = resolveDevice("auto")

      if (!modelCached) {
        setRunPhase("downloading_model")
        setPhaseLabel(`Downloading ${MINILM.label} model…`)
        setPct(0)
        await downloadModel(MINILM.id, "auto", (info) => {
          if (info.status === "progress") setPct(Math.round(info.progress ?? 0))
        })
      }

      // 4. Extract text + split into sentences
      setRunPhase("aligning")
      const maxSentences = getStoredMaxSentences()
      const alignStart = Date.now()

      const {
        srcRecords,
        tgtRecords,
        srcParas,
        tgtParas,
        srcTruncated,
        tgtTruncated,
      } = await extractAndSplit({
        srcBlob: jpFile,
        srcType: "epub",
        srcLang: "ja",
        tgtBlob: enFile,
        tgtType: "epub",
        tgtLang: "en",
        maxSentences,
        preprocessRules: ALICE_PREPROCESS_RULES,
        onProgress: (e) => {
          setPhaseLabel(PHASE_LABELS[e.phase] ?? e.phase)
          if (e.current != null && e.total != null) {
            setPct(Math.round((e.current / e.total) * 100))
          }
        },
      })

      if (srcTruncated || tgtTruncated) {
        const sides = [srcTruncated && "source", tgtTruncated && "target"]
          .filter(Boolean)
          .join(" and ")
        setTruncationNote(
          `The ${sides} book was capped at ${maxSentences.toLocaleString()} sentences — some content was excluded.`
        )
      }

      // 5. Run alignment worker
      setPhaseLabel("Running alignment algorithm…")
      setPct(null)

      const pairs = await new Promise<AlignedPair[]>((resolve, reject) => {
        const worker = new AlignmentWorker()

        worker.onmessage = (e: MessageEvent<AlignWorkerOutput>) => {
          if (e.data.type === "progress") {
            const ev = e.data.event
            if (ev.current != null && ev.total != null) {
              setPct(Math.round((ev.current / ev.total) * 100))
            }
          }
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

        worker.postMessage({
          type: "align",
          params: {
            srcRecords,
            tgtRecords,
            modelId: MINILM.id,
            gapPenalty: 0,
            device,
          },
        })
      })

      // 6. Save and navigate
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
        src_lang: "ja",
        tgt_lang: "en",
        total_src_sentences: srcRecords.length,
        total_tgt_sentences: tgtRecords.length,
        aligned_count,
        src_gap_count,
        tgt_gap_count,
        source_paragraphs: srcParas,
        target_paragraphs: tgtParas,
      }

      const meta: AlignmentMeta = {
        modelId: MINILM.id,
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
      setRunPhase("error")
      setError(err instanceof Error ? err.message : "Something went wrong.")
    }
  }

  if (dismissed) return null

  function dismiss() {
    localStorage.setItem(SAMPLE_BANNER_KEY, "1")
    setDismissed(true)
  }

  return (
    <>
      {/* Trigger row */}
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm">
        <BookOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-muted-foreground">
          New here?{" "}
          <button
            type="button"
            onClick={openModal}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Try a sample alignment — Alice in Wonderland (JP ↔ EN)
          </button>
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-muted-foreground"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="relative w-full max-w-md rounded-xl border bg-card shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold">Try a sample alignment</h2>
              {!isRunning && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                This will download and align{" "}
                <span className="font-medium text-foreground">
                  Alice in Wonderland
                </span>{" "}
                in Japanese and English — a great way to test the tool without
                uploading your own books.
              </p>

              {/* Download breakdown */}
              <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
                <p className="mb-2 font-medium text-foreground">
                  What will be downloaded:
                </p>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    Alice in Wonderland (Japanese) — ~21 MB
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    Alice in Wonderland (English) — ~190 KB
                  </li>
                  <li className="flex items-center gap-2">
                    {modelCached ? (
                      <CheckCircle className="size-3.5 text-primary" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                    )}
                    <span>
                      {MINILM.label} model — ~{MINILM.sizeMb} MB
                    </span>
                    {modelCached && (
                      <span className="rounded border border-primary/30 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                        cached
                      </span>
                    )}
                  </li>
                </ul>
                <p className="mt-2.5 text-xs text-muted-foreground/70">
                  {modelCached
                    ? "Model already cached — only books will download."
                    : `Total first-run download: ~${MINILM.sizeMb + 21} MB`}
                </p>
              </div>

              {/* Progress */}
              {isRunning && (
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground">{phaseLabel}</p>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </div>
                  {pct != null && (
                    <p className="text-xs text-muted-foreground">{pct}%</p>
                  )}
                </div>
              )}

              {/* Truncation note */}
              {truncationNote && (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  <Warning className="mt-0.5 size-4 shrink-0" />
                  {truncationNote}
                </p>
              )}

              {/* Error */}
              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              {!isRunning && (
                <Button variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
              )}
              <Button
                onClick={isRunning ? undefined : handleRun}
                disabled={isRunning}
              >
                {isRunning ? "Running…" : "Download & Align"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
