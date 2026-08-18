import type { AlignmentRecord } from "@/types/alignment"
import type { Book, ParagraphExclusion } from "@/types/book"
import Dexie, { type Table } from "dexie"

export class BooksDatabase extends Dexie {
  books!: Table<Book, string>
  alignments!: Table<AlignmentRecord, string>
  paragraphExclusions!: Table<ParagraphExclusion, string>

  constructor() {
    super("local-books")
    this.version(1).stores({
      books: "id, title, type, fileName",
    })
    this.version(2).stores({
      books: "id, title, type, fileName",
      alignments: "id, sourceBookId, targetBookId, createdAt",
    })
    this.version(3).stores({
      books: "id, title, type, fileName",
      alignments: "id, sourceBookId, targetBookId, createdAt",
      paragraphExclusions: "bookId",
    })
  }
}

export const db = new BooksDatabase()
