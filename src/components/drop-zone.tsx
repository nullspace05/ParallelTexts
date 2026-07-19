import { extractEpubMetadata } from "@/lib/epub"
import { extractPdfMetadata } from "@/lib/pdf"
import { extractTxtMetadata } from "@/lib/txt"
import { addBook } from "@/store/books"
import type { Book, BookType } from "@/types/book"
import { FileArrowUp } from "@phosphor-icons/react"
import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"

const ACCEPTED_TYPES = {
  "application/epub+zip": [".epub"],
  "application/pdf": [".pdf"],
  "text/plain": [".txt"],
}

export function DropZone() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("")

  const processFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase()
    const isEpub =
      lower.endsWith(".epub") || file.type === "application/epub+zip"
    const isPdf = lower.endsWith(".pdf") || file.type === "application/pdf"
    const isTxt = lower.endsWith(".txt") || file.type === "text/plain"

    if (!isEpub && !isPdf && !isTxt) return

    setStatus("loading")
    setErrorMessage(null)
    setProgress(10)
    setProgressLabel("Reading file…")

    try {
      let title: string
      let coverDataUrl: string | null
      let type: BookType

      setProgress(30)
      setProgressLabel("Extracting metadata…")

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
      setProgressLabel("Saving…")

      const book: Book = {
        id: crypto.randomUUID(),
        title,
        coverDataUrl,
        type,
        fileName: file.name,
        fileBlob: file,
      }

      await addBook(book)
      setProgress(100)
      setStatus("idle")
      setProgress(0)
      setProgressLabel("")
    } catch (err) {
      setStatus("error")
      setProgress(0)
      setProgressLabel("")
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to process file"
      )
    }
  }, [])

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
      <FileArrowUp
        className={`size-9 ${isDragActive ? "text-primary" : "text-muted-foreground/70"}`}
      />
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-foreground/80">
          {isDragActive
            ? "Drop files to upload"
            : "Drag & drop files here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground">EPUB, PDF, or TXT</p>
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
      {status === "error" && errorMessage && (
        <p className="mt-1 text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  )
}
