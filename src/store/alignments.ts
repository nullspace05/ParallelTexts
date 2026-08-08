import { db } from "@/lib/db"
import type {
  AlignmentMeta,
  AlignmentRecord,
  AlignmentResult,
} from "@/types/alignment"

export async function addAlignment(
  sourceBookId: string,
  targetBookId: string,
  sourceBookTitle: string,
  targetBookTitle: string,
  result: AlignmentResult,
  meta?: AlignmentMeta,
  importedFrom?: AlignmentRecord["importedFrom"]
): Promise<string> {
  const id = crypto.randomUUID()
  const record: AlignmentRecord = {
    id,
    sourceBookId,
    targetBookId,
    sourceBookTitle,
    targetBookTitle,
    result,
    ...(meta ? { meta } : {}),
    ...(importedFrom ? { importedFrom } : {}),
    createdAt: Date.now(),
  }
  await db.alignments.add(record)
  return id
}

export async function getAlignment(
  id: string
): Promise<AlignmentRecord | undefined> {
  return db.alignments.get(id)
}

export async function getAllAlignments(): Promise<Array<AlignmentRecord>> {
  return db.alignments.orderBy("createdAt").reverse().toArray()
}

export async function getAlignmentsCount(): Promise<number> {
  return db.alignments.count()
}

export async function getAlignmentsPaginated(
  offset: number,
  limit: number
): Promise<Array<AlignmentRecord>> {
  return db.alignments
    .orderBy("createdAt")
    .reverse()
    .offset(offset)
    .limit(limit)
    .toArray()
}

export async function getAlignmentsForBook(
  bookId: string
): Promise<Array<AlignmentRecord>> {
  return db.alignments
    .where("sourceBookId")
    .equals(bookId)
    .or("targetBookId")
    .equals(bookId)
    .sortBy("createdAt")
}

export async function deleteAlignment(id: string): Promise<void> {
  await db.alignments.delete(id)
}
