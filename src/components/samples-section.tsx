import { SAMPLE_CARD_DOT_COLORS } from "@/lib/equivalence-palette"
import {
  getOperationErrorMessage,
  trackOperation,
  withTimeout,
} from "@/lib/operation-diagnostics"
import { parsePtEpub } from "@/lib/pt-epub"
import { SAMPLE_ALIGNMENTS, sampleAlignmentUrl } from "@/lib/sample-books"
import { cn } from "@/lib/utils"
import { addAlignment } from "@/store/alignments"
import { BookOpenIcon, CircleNotchIcon } from "@phosphor-icons/react"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

export function SampleDot({
  colorClass,
  loading,
}: {
  colorClass: string
  loading?: boolean
}) {
  if (loading) {
    return (
      <CircleNotchIcon
        className="size-[1em] shrink-0 animate-spin text-primary"
        aria-hidden
      />
    )
  }

  return (
    <span
      className={cn("size-[1em] shrink-0 rounded-full", colorClass)}
      aria-hidden
    />
  )
}

function LangBadges({
  sourceLang,
  targetLang,
}: {
  sourceLang: string
  targetLang: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {sourceLang}
      </span>
      <span className="text-[10px] text-muted-foreground/50">↔</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {targetLang}
      </span>
    </span>
  )
}

export function SamplesSection() {
  const navigate = useNavigate()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function openSample(sample: (typeof SAMPLE_ALIGNMENTS)[number]) {
    setLoadingId(sample.id)
    try {
      const id = await trackOperation(
        "sample_open",
        { sampleId: sample.id },
        async () => {
          const response = await withTimeout(
            "Sample book download",
            60_000,
            fetch(sampleAlignmentUrl(sample.filename))
          )
          if (!response.ok)
            throw new Error("Failed to download the sample file.")

          const record = await withTimeout(
            "Sample book processing",
            60_000,
            response.blob().then((blob) => parsePtEpub(blob))
          )
          if (!record) throw new Error("The sample file could not be read.")

          return trackOperation("sample_alignment_save", {}, () =>
            addAlignment(
              record.sourceBookId,
              record.targetBookId,
              sample.sourceTitle,
              sample.targetTitle,
              record.result,
              record.meta,
              "epub"
            )
          )
        }
      )

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
    } catch (err) {
      setLoadingId(null)
      const message = getOperationErrorMessage(err, "Something went wrong.")
      toast.error("Could not open sample book", { description: message })
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Samples
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SAMPLE_ALIGNMENTS.map((sample, i) => {
          const loading = loadingId === sample.id
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => openSample(sample)}
              disabled={loadingId !== null}
              aria-label={`View example: ${sample.targetTitle}`}
              className="group cursor-pointer rounded-lg border bg-muted/20 p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:cursor-wait disabled:opacity-60"
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
                  <BookOpenIcon className="size-3" />
                  Example
                </span>
                <LangBadges
                  sourceLang={sample.sourceLang}
                  targetLang={sample.targetLang}
                />
              </div>
              <div className="mt-2.5 w-full min-w-0">
                <p className="truncate text-sm leading-snug font-medium">
                  {sample.sourceTitle}
                </p>
                <p className="mt-0.5 flex w-full min-w-0 items-center justify-between gap-2 text-sm leading-snug text-muted-foreground">
                  <span className="min-w-0 truncate">{sample.targetTitle}</span>
                  <SampleDot
                    colorClass={SAMPLE_CARD_DOT_COLORS[i]}
                    loading={loading}
                  />
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
