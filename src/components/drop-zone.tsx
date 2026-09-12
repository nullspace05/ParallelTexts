import { extractEpubMetadata } from "@/lib/epub"
import {
  getOperationErrorMessage,
  trackOperation,
} from "@/lib/operation-diagnostics"
import { extractPdfMetadata } from "@/lib/pdf"
import { extractTxtMetadata } from "@/lib/txt"
import { addBook } from "@/store/books"
import type { Book, BookType } from "@/types/book"
import { FileArrowUpIcon } from "@phosphor-icons/react"
import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

const ACCEPTED_TYPES = {
  "application/epub+zip": [".epub"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
}

export function DropZone() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<"idle" | "loading">("idle")
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")

  const processFile = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase()
      const isEpub =
        lower.endsWith(".epub") || file.type === "application/epub+zip"
      const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf"
      const isTxt = lower.endsWith(".txt") || file.type === "text/plain"

      if (!isEpub && !isPdf && !isTxt) return

      setStatus("loading")
      setProgress(10)
      setProgressLabel(t("dropZone.reading"))
      try {
        let title: string
        let coverDataUrl: string | null
        let type: BookType

        setProgress(30)
        setProgressLabel(t("dropZone.extracting"))

        if (isEpub) {
          const result = await extractEpubMetadata(file)
          title = result.title
          coverDataUrl = result.coverDataUrl
          type = "epub"
        } else if (isPdf) {
          const result = await extractPdfMetadata(file)
          title = result.title
          coverDataUrl = result.coverDataUrl
          type = "pdf"
        } else {
          const result = await extractTxtMetadata(file)
          title = result.title
          coverDataUrl = result.coverDataUrl
          type = "txt"
        }

        setProgress(80)
        setProgressLabel(t("dropZone.saving"))

        const book: Book = {
          id: crypto.randomUUID(),
          title,
          coverDataUrl,
          type,
          fileName: file.name,
          fileBlob: file,
        }

        await trackOperation("book_import", { type }, () => addBook(book))
        setProgress(100)
        setStatus("idle")
        setProgress(0)
        setProgressLabel("")
      } catch (err) {
        setStatus("idle")
        setProgress(0)
        setProgressLabel("")
        const message = getOperationErrorMessage(err, "Failed to process file")
        toast.error(t("dropZone.importError"), { description: message })
      }
    },
    [t]
  )

  const onDrop = useCallback(
    async (acceptedFiles: Array<File>) => {
      for (const file of acceptedFiles) {
        await processFile(file)
      }
    },
    [processFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    multiple: true,
    disabled: status === "loading",
  })

  return (
    <div
      {...getRootProps()}
      className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-muted-foreground/25 bg-muted/25 px-6 py-10 transition-colors hover:border-muted-foreground/40 hover:bg-muted/40 ${isDragActive ? "border-primary bg-primary/5" : ""} ${status === "loading" ? "pointer-events-none opacity-70" : ""}`}
    >
      <input {...getInputProps()} />
      <FileArrowUpIcon
        className={`size-9 ${isDragActive ? "text-primary" : "text-muted-foreground/70"}`}
      />
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-foreground/80">
          {isDragActive ? t("dropZone.drop") : t("dropZone.browse")}
        </p>
        <p className="text-xs text-muted-foreground">{t("dropZone.formats")}</p>
      </div>
      {status === "loading" && (
        <div className="mt-2 w-full max-w-xs space-y-1.5">
          <p className="text-center text-sm text-muted-foreground">
            {progressLabel}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/20">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
