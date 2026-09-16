import { useEffect } from "react"
import { useTranslation } from "react-i18next"

interface MobileComputeDialogProps {
  modelLabel: string
  open: boolean
  sizeMb: number
  onContinue: () => void
  onOpenChange: (open: boolean) => void
}

export function MobileComputeDialog({
  modelLabel,
  open,
  sizeMb,
  onContinue,
  onOpenChange,
}: MobileComputeDialogProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false)
    }

    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [onOpenChange, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={t("mobileCompute.useDesktop")}
        className="absolute inset-0 size-full bg-black/70 supports-backdrop-filter:backdrop-blur-xs"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-compute-title"
        aria-describedby="mobile-compute-description"
        className="absolute top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-5 text-popover-foreground shadow-xl outline-none"
      >
        <h2
          id="mobile-compute-title"
          className="font-heading text-lg font-medium text-foreground"
        >
          {t("mobileCompute.title")}
        </h2>
        <p
          id="mobile-compute-description"
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          {t("mobileCompute.description", {
            model: modelLabel,
            size: sizeMb.toLocaleString(),
          })}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            {t("mobileCompute.useDesktop")}
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={onContinue}
          >
            {t("mobileCompute.tryAnyway")}
          </button>
        </div>
      </div>
    </div>
  )
}
