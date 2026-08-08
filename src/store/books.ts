import { db } from "@/lib/db"
import type { Book } from "@/types/book"

export async function addBook(book: Book): Promise<void> {
  await db.books.add(book)
}

export async function removeBook(id: string): Promise<void> {
  await db.books.delete(id)
}

export async function getBook(id: string): Promise<Book | undefined> {
  return db.books.get(id)
}

export async function getAllBooks(): Promise<Array<Book>> {
  return db.books.toArray()
}
