import { ImageCarousel } from "@/components/image-carousel"
import { SAMPLE_IMAGES, sampleImageIndex } from "@/lib/sample-images"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export function ClickableSampleImage({
  src,
  alt,
  className,
  imgClassName,
}: {
  src: string
  alt: string
  className?: string
  imgClassName?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg"
        aria-label={t("samples.viewMore")}
      >
        <img src={src} alt={alt} className={cn(imgClassName)} />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-sm font-medium text-white">
            {t("samples.viewMoreOverlay")}
          </span>
        </span>
      </button>

      {open && (
        <ImageCarousel
          images={SAMPLE_IMAGES}
          initialIndex={sampleImageIndex(src)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
