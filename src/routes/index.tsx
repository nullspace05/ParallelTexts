import { AlignBooksForm } from "@/components/align-books-form"
import { DropZone } from "@/components/drop-zone"
import { SampleAlignmentBanner } from "@/components/sample-alignment-banner"
import { Devices, X } from "@phosphor-icons/react"
import { createFileRoute, Link } from "@tanstack/react-router"
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
    <div className="relative flex gap-6 rounded-lg border bg-card p-5 text-sm">
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(INTRO_KEY, "1")
          setDismissed(true)
        }}
        className="absolute top-3 right-3 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
      <img
        src="/samples/tlp-01.png"
        alt="ParalleTexts side-by-side reading view"
        className="hidden h-80 w-auto shrink-0 rounded object-cover sm:block"
      />
      <div className="my-3 flex flex-1 flex-col justify-between pr-6">
        <p className="leading-relaxed text-foreground">
          <span className="font-medium">ParallelTexts</span> aligns two books in
          different languages sentence-by-sentence, so you can read them side by
          side.
        </p>
        <div className="space-y-2">
          <p className="leading-relaxed text-muted-foreground">
            To begin, upload two files below — a book and its translation.
          </p>
          <Link
            to="/about"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Read more →
          </Link>
        </div>
      </div>
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
