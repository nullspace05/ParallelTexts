import {
  ImageCarousel,
  type ImageCarouselItem,
} from "@/components/image-carousel"
import type { ImageAsset } from "@/types/alignment"
import { useMemo, useState } from "react"

function imageSource(image: ImageAsset): string {
  return `data:${image.mime_type};base64,${image.data_base64}`
}

export function ClickableBookImage({
  image,
  images,
}: {
  image: ImageAsset
  images: ImageAsset[]
}) {
  const [open, setOpen] = useState(false)
  const carouselImages = useMemo<ImageCarouselItem[]>(
    () => images.map((asset) => ({ src: imageSource(asset), alt: "" })),
    [images]
  )
  const initialIndex = images.indexOf(image)

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        className="mx-auto mb-4 block max-w-full cursor-pointer"
        aria-label="View image"
      >
        <img
          src={imageSource(image)}
          alt=""
          className="max-h-80 max-w-full object-contain"
        />
      </button>
      {open && (
        <ImageCarousel
          images={carouselImages}
          initialIndex={Math.max(initialIndex, 0)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
