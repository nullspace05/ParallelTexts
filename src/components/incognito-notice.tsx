import {
  getStoredIncognitoNoticeDismissed,
  setStoredIncognitoNoticeDismissed,
} from "@/lib/user-settings"
import { WarningCircle, X } from "@phosphor-icons/react"
import { useState } from "react"

export function IncognitoNotice() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return getStoredIncognitoNoticeDismissed()
  })

  if (dismissed) return null

  return (
    <div className="relative rounded-xl border border-primary/20 bg-primary/5 px-6 py-5 pr-12">
      <button
        type="button"
        onClick={() => {
          setStoredIncognitoNoticeDismissed(true)
          setDismissed(true)
        }}
        className="absolute top-4 right-4 rounded-md p-1 text-primary transition-colors hover:bg-primary/10 hover:text-primary"
        aria-label="Dismiss incognito notice"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <WarningCircle className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">
            Incognito / private windows may not work
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Alignments, uploads and downloads can fail or hang on incognito
            windows. For the best results, use a normal browser window.
          </p>
        </div>
      </div>
    </div>
  )
}
