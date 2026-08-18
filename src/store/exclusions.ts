import { db } from "@/lib/db"

export async function getExclusions(bookId: string): Promise<number[]> {
  const row = await db.paragraphExclusions.get(bookId)
  return row?.excludedParaIdxs ?? []
}

export async function setExclusions(
  bookId: string,
  excludedParaIdxs: number[]
): Promise<void> {
  await db.paragraphExclusions.put({ bookId, excludedParaIdxs })
}

export async function removeExclusions(bookId: string): Promise<void> {
  await db.paragraphExclusions.delete(bookId)
}
