import { AlignBooksForm } from "@/components/align-books-form"
import { DropZone } from "@/components/drop-zone"
import { SampleAlignmentBanner } from "@/components/sample-alignment-banner"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Devices, X } from "@phosphor-icons/react"
import { useState } from "react"

export const Route = createFileRoute("/")({ component: App })

const INTRO_KEY = "intro-dismissed"

function IntroBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(INTRO_KEY) === "1"
  })

  if (dismissed) return null

  return (
    <div className="relative rounded-lg border bg-card px-4 py-3.5 pr-10 text-sm">
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(INTRO_KEY, "1")
          setDismissed(true)
        }}
        className="absolute top-2.5 right-2.5 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
      <p className="leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">ParallelTexts</span>{" "}
        aligns two books in different languages sentence-by-sentence, so you can
        read them side by side. Made for language learners, translators, and
        researchers.{" "}
        <Link
          to="/about"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Read more →
        </Link>
      </p>
      <p className="leading-relaxed text-muted-foreground">
        To begin, upload two files below — a book and its translation.
      </p>
    </div>
  )
}

function App() {
  return (
    <div className="min-h-[calc(100svh-56px)] bg-muted/20 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Mobile notice — hidden on sm+ */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-800 sm:hidden dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
          <Devices className="mt-0.5 size-4 shrink-0" />
          <span>
            Best on desktop — alignment is compute-intensive and works best with
            a full keyboard and more RAM.
          </span>
        </div>
        <IntroBanner />
        <DropZone />
        <SampleAlignmentBanner />
        <AlignBooksForm />
      </div>
    </div>
  )
}
