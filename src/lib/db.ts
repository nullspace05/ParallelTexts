import type { AlignmentRecord } from "@/types/alignment"
import type { Book } from "@/types/book"
import Dexie, { type Table } from "dexie"

export class BooksDatabase extends Dexie {
  books!: Table<Book, string>
  alignments!: Table<AlignmentRecord, string>

  constructor() {
    super("local-books")
    this.version(1).stores({
      books: "id, title, type, fileName",
    })
    this.version(2).stores({
      books: "id, title, type, fileName",
      alignments: "id, sourceBookId, targetBookId, createdAt",
    })
  }
}

export const db = new BooksDatabase()
