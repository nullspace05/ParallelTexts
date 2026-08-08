import { DropZone } from "@/components/drop-zone"
import { db } from "@/lib/db"
import { removeBook } from "@/store/books"
import type { Book } from "@/types/book"
import { Link, createFileRoute } from "@tanstack/react-router"
import { useLiveQuery } from "dexie-react-hooks"
import { Books, BookOpen, Trash } from "@phosphor-icons/react"
import { useState } from "react"

export const Route = createFileRoute("/books")({
  component: BooksPage,
})

function BooksPage() {
  const books = useLiveQuery(() => db.books.toArray(), []) ?? []
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function handleDelete(book: Book) {
    await removeBook(book.id)
    setConfirmId(null)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <DropZone />
      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Books className="size-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">No books uploaded yet.</p>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-light tracking-tight">
            Books ({books.length})
          </h1>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {books.map((book) => (
              <div
                key={book.id}
                className="group relative rounded-lg border bg-card transition-colors hover:bg-muted/40"
              >
                <Link
                  to="/book/$id"
                  params={{ id: book.id }}
                  search={{
                    view: "detail",
                    pageNumHidden: false,
                    charCount: 0,
                    totalChars: 0,
                  }}
                  className="block p-3"
                >
                  {book.coverDataUrl ? (
                    <img
                      src={book.coverDataUrl}
                      alt={book.title}
                      className="mb-2 h-36 w-full rounded object-cover"
                    />
                  ) : (
                    <div className="mb-2 flex h-36 w-full items-center justify-center rounded bg-muted">
                      <BookOpen className="size-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <p className="line-clamp-2 text-xs leading-tight font-medium">
                    {book.title || book.fileName}
                  </p>
                  <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">
                    {book.type}
                  </span>
                </Link>

                {confirmId === book.id ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/95 p-2">
                    <p className="text-center text-xs text-muted-foreground">
                      Delete this book?
                    </p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(book)}
                        className="text-destructive-foreground rounded bg-destructive px-2 py-1 text-xs hover:bg-destructive/90"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="rounded border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      setConfirmId(book.id)
                    }}
                    className="absolute top-1.5 right-1.5 rounded p-1 opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Delete book"
                  >
                    <Trash className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
