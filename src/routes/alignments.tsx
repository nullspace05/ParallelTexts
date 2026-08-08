import { AlignBooksForm } from "@/components/align-books-form"
import { SampleDot } from "@/components/samples-section"
import { Button } from "@/components/ui/button"
import { SAMPLE_CARD_DOT_COLORS } from "@/lib/equivalence-palette"
import { parseTsv } from "@/lib/import-tsv"
import { parsePtEpub } from "@/lib/pt-epub"
import {
  addAlignment,
  deleteAlignment,
  getAllAlignments,
} from "@/store/alignments"
import type {
  AlignedPair,
  AlignmentMeta,
  AlignmentRecord,
} from "@/types/alignment"
import { MODEL_REGISTRY } from "@/utils/model"
import {
  ArrowsLeftRight,
  CheckCircle,
  Clock,
  Info,
  Trash,
  Upload,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { useCallback, useRef, useState } from "react"

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

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function modelLabel(meta: AlignmentMeta): string {
  return (
    MODEL_REGISTRY.find((m) => m.id === meta.modelId)?.label ?? meta.modelId
  )
}

export const Route = createFileRoute("/alignments")({
  component: AlignmentsPage,
})

function AlignmentsPage() {
  const records = useLiveQuery(() => getAllAlignments(), []) ?? []
  const [showImport, setShowImport] = useState(false)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <AlignBooksForm />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SampleDot colorClass={SAMPLE_CARD_DOT_COLORS[1]} loading={false} />
          <h1 className="text-xl font-light tracking-tight">
            Alignment history
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowImport(true)}
          className="gap-1.5"
        >
          <Upload className="size-4" />
          Import
        </Button>
      </div>

      {records.length === 0 ? (
        <div className="flex min-h-[20vh] flex-col items-center justify-center gap-3 text-center">
          <ArrowsLeftRight className="size-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">No alignments yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((record) => (
            <AlignmentCard key={record.id} record={record} />
          ))}
        </div>
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}

// ── Alignment card ────────────────────────────────────────────────────────────

function AlignmentCard({ record }: { record: AlignmentRecord }) {
  const [confirming, setConfirming] = useState(false)

  const date = new Date(record.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  const { result } = record
  const matchPct =
    result.pairs.length > 0
      ? Math.round((result.aligned_count / result.pairs.length) * 100)
      : 0

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    await deleteAlignment(record.id)
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
      <Link
        to="/alignment/$id"
        params={{ id: record.id }}
        search={{
          // Left unset so the alignment page falls back to each user's
          // saved per-alignment view/pageNumHidden preference instead of
          // always forcing popover view on every visit from this list.
          view: undefined,
          pageNumHidden: undefined,
          charCount: 0,
          totalChars: 0,
        }}
        className="min-w-0 flex-1 hover:opacity-80"
      >
        <p className="truncate font-medium">
          {record.sourceBookTitle}
          <span className="mx-2 font-normal text-muted-foreground">↔</span>
          {record.targetBookTitle}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="uppercase">
            {result.src_lang} → {result.tgt_lang}
          </span>
          <span>
            {result.aligned_count.toLocaleString()} matched ({matchPct}%)
          </span>
          <span>{result.pairs.length.toLocaleString()} pairs total</span>
          {record.importedFrom === "tsv" || record.importedFrom === "epub" ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
              {record.importedFrom === "epub" ? "EPUB import" : "TSV import"}
            </span>
          ) : record.meta ? (
            <>
              <span>{modelLabel(record.meta)}</span>
              <span className="uppercase">{record.meta.device}</span>
              <span>{record.meta.dtype}</span>
              <span>{formatDuration(record.meta.durationMs)}</span>
            </>
          ) : null}
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {date}
          </span>
        </div>
      </Link>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-destructive">Delete?</span>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleDelete}
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          aria-label="Delete alignment"
        >
          <Trash className="size-4" />
        </button>
      )}
    </div>
  )
}

// ── Import modal (TSV + ParallelTexts EPUB) ───────────────────────────────────

type FileState =
  | { kind: "tsv"; parsed: ReturnType<typeof parseTsv> }
  | { kind: "pt-epub"; record: AlignmentRecord }
  | { kind: "bad-epub" }

function ImportModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileState, setFileState] = useState<FileState | null>(null)
  const [fileName, setFileName] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)

  // Editable metadata fields (pre-filled from TSV when detected)
  const [srcTitle, setSrcTitle] = useState("")
  const [tgtTitle, setTgtTitle] = useState("")
  const [srcLang, setSrcLang] = useState("und")
  const [tgtLang, setTgtLang] = useState("und")

  const [importing, setImporting] = useState(false)

  async function applyFile(file: File) {
    setFileName(file.name)
    setFileState(null)

    if (file.name.toLowerCase().endsWith(".epub")) {
      setLoading(true)
      try {
        const record = await parsePtEpub(file)
        setFileState(
          record ? { kind: "pt-epub", record } : { kind: "bad-epub" }
        )
      } catch {
        setFileState({ kind: "bad-epub" })
      } finally {
        setLoading(false)
      }
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const result = parseTsv(text)
      setFileState({ kind: "tsv", parsed: result })
      if (result.srcTitle) setSrcTitle(result.srcTitle)
      if (result.tgtTitle) setTgtTitle(result.tgtTitle)
      if (result.srcLang) setSrcLang(result.srcLang)
      if (result.tgtLang) setTgtLang(result.tgtLang)
    }
    reader.readAsText(file, "utf-8")
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) applyFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) applyFile(file)
  }, [])

  async function handleImport() {
    if (!fileState) return
    setImporting(true)
    try {
      if (fileState.kind === "pt-epub") {
        const rec = fileState.record
        const id = await addAlignment(
          rec.sourceBookId,
          rec.targetBookId,
          rec.sourceBookTitle,
          rec.targetBookTitle,
          rec.result,
          rec.meta,
          "epub"
        )
        onClose()
        navigate({
          to: "/alignment/$id",
          params: { id },
          search: {
            view: undefined,
            pageNumHidden: undefined,
            charCount: 0,
            totalChars: 0,
          },
        })
        return
      }

      if (fileState.kind === "tsv") {
        const { parsed } = fileState
        if (parsed.errors.length > 0 || parsed.rows.length === 0) return

        const pairs: AlignedPair[] = parsed.rows.map((row) => ({
          src_text: row.src,
          tgt_text: row.tgt,
          alignment_type: row.alignmentType,
          confidence: row.confidence,
          src_sent_idx: null,
          src_para_idx: null,
          src_global_idx: null,
          tgt_sent_idx: null,
          tgt_para_idx: null,
          tgt_global_idx: null,
          src_images: null,
          tgt_images: null,
        }))

        const aligned_count = pairs.filter(
          (p) => p.alignment_type === "1:1"
        ).length
        const src_gap_count = pairs.filter(
          (p) => p.alignment_type === "1:0"
        ).length
        const tgt_gap_count = pairs.filter(
          (p) => p.alignment_type === "0:1"
        ).length

        const id = await addAlignment(
          "imported",
          "imported",
          srcTitle || "Source",
          tgtTitle || "Target",
          {
            pairs,
            src_lang: srcLang,
            tgt_lang: tgtLang,
            total_src_sentences: aligned_count + src_gap_count,
            total_tgt_sentences: aligned_count + tgt_gap_count,
            aligned_count,
            src_gap_count,
            tgt_gap_count,
          },
          undefined,
          "tsv"
        )
        onClose()
        navigate({
          to: "/alignment/$id",
          params: { id },
          search: {
            view: undefined,
            pageNumHidden: undefined,
            charCount: 0,
            totalChars: 0,
          },
        })
      }
    } finally {
      setImporting(false)
    }
  }

  const canImport =
    fileState?.kind === "pt-epub" ||
    (fileState?.kind === "tsv" &&
      fileState.parsed.errors.length === 0 &&
      fileState.parsed.rows.length > 0)

  const tsvParsed = fileState?.kind === "tsv" ? fileState.parsed : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">Import alignment</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Format info */}
          <div className="flex gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-muted-foreground">
              <p className="font-medium">Accepted formats</p>
              <ul className="list-inside list-disc space-y-0.5 text-xs">
                <li>
                  <strong>.epub</strong> exported by ParallelTexts — restores
                  the alignment exactly as it was
                </li>
                <li>
                  <strong>.tsv / .txt</strong> —{" "}
                  <span className="font-mono">
                    source_text[TAB]target_text[TAB]confidence
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* File drop zone */}
          <div
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Upload className="size-6 text-muted-foreground" />
            {loading ? (
              <p className="text-sm text-muted-foreground">Reading file…</p>
            ) : fileName ? (
              <p className="text-sm font-medium">{fileName}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Drop a file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground/60">
                  .epub (ParallelTexts) · .tsv · .txt
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.tsv,.txt,application/epub+zip,text/tab-separated-values,text/plain"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* PT EPUB detected */}
          {fileState?.kind === "pt-epub" && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-primary">
                <CheckCircle className="size-4 shrink-0" />
                ParallelTexts EPUB detected
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fileState.record.sourceBookTitle} ↔{" "}
                {fileState.record.targetBookTitle} ·{" "}
                {fileState.record.result.pairs.length.toLocaleString()} pairs
              </p>
            </div>
          )}

          {/* Bad EPUB */}
          {fileState?.kind === "bad-epub" && (
            <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">
                This EPUB was not exported by ParallelTexts and cannot be
                imported as an alignment.
              </p>
            </div>
          )}

          {/* TSV parse errors */}
          {tsvParsed && tsvParsed.errors.length > 0 && (
            <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="space-y-1 text-sm">
                {tsvParsed.errors.map((e, i) => (
                  <p key={i} className="text-destructive">
                    {e}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* TSV parse success + preview */}
          {tsvParsed &&
            tsvParsed.errors.length === 0 &&
            tsvParsed.rows.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-primary">
                    <CheckCircle className="size-4 shrink-0" />
                    {tsvParsed.rows.length.toLocaleString()} pairs detected
                  </span>
                  <span className="text-muted-foreground">
                    ·{" "}
                    {tsvParsed.hasConfidence
                      ? "3 columns (with confidence)"
                      : "2 columns"}
                  </span>
                  {tsvParsed.fromParallelTexts && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      ParallelTexts export
                    </span>
                  )}
                </div>

                {tsvParsed.warnings.length > 0 && (
                  <details className="rounded-lg border bg-amber-50 dark:bg-amber-950/20">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                      {tsvParsed.warnings.length} warning
                      {tsvParsed.warnings.length !== 1 ? "s" : ""}
                    </summary>
                    <ul className="space-y-1 px-3 pb-3">
                      {tsvParsed.warnings.map((w, i) => (
                        <li
                          key={i}
                          className="text-xs text-amber-700 dark:text-amber-400"
                        >
                          {w}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="overflow-hidden rounded-md border text-xs">
                  <div className="grid grid-cols-2 gap-px border-b bg-muted/50 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <span>Source</span>
                    <span>Target</span>
                  </div>
                  {tsvParsed.rows.slice(0, 4).map((row, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-2 gap-3 border-b px-3 py-2 last:border-0"
                    >
                      <span className="truncate text-muted-foreground">
                        {row.src}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {row.tgt}
                      </span>
                    </div>
                  ))}
                  {tsvParsed.rows.length > 4 && (
                    <p className="px-3 py-1.5 text-muted-foreground/60">
                      … and {(tsvParsed.rows.length - 4).toLocaleString()} more
                    </p>
                  )}
                </div>
              </div>
            )}

          {/* TSV metadata fields */}
          {tsvParsed && tsvParsed.errors.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Alignment details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Source title
                  </label>
                  <input
                    type="text"
                    value={srcTitle}
                    onChange={(e) => setSrcTitle(e.target.value)}
                    placeholder="e.g. Norwegian Wood"
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Target title
                  </label>
                  <input
                    type="text"
                    value={tgtTitle}
                    onChange={(e) => setTgtTitle(e.target.value)}
                    placeholder="e.g. ノルウェイの森"
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Source language
                  </label>
                  <select
                    value={srcLang}
                    onChange={(e) => setSrcLang(e.target.value)}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Target language
                  </label>
                  <select
                    value={tgtLang}
                    onChange={(e) => setTgtLang(e.target.value)}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button disabled={!canImport || importing} onClick={handleImport}>
              {importing
                ? "Importing…"
                : fileState?.kind === "pt-epub"
                  ? `Import ${fileState.record.result.pairs.length.toLocaleString()} pairs`
                  : tsvParsed && tsvParsed.rows.length > 0
                    ? `Import ${tsvParsed.rows.length.toLocaleString()} pairs`
                    : "Import"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
