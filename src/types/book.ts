export type BookType = "epub" | "pdf" | "txt"

/** Stored in IndexedDB. fileBlob is a Blob (File becomes Blob when retrieved). */
export interface Book {
  id: string
  title: string
  coverDataUrl: string | null
  type: BookType
  fileName: string
  fileBlob: Blob
}

/** Helper: create a File from stored Book for backend upload later */
export function bookToFile(book: Book): File {
  return new File([book.fileBlob], book.fileName, { type: book.fileBlob.type })
}
